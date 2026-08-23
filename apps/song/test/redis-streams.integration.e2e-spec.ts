import Redis from 'ioredis';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import {
  type RedisAutoClaimResponse,
  streamField,
} from '../src/common/redis/stream-entry';

loadEnv({ path: resolve(__dirname, '../.env') });

/**
 * Requires a real Redis server. Run with REDIS_STREAMS_INTEGRATION=1 and a
 * disposable REDIS_URL; every test uses and deletes a uniquely named stream.
 */
const describeRedis =
  process.env.REDIS_STREAMS_INTEGRATION === '1' ? describe : describe.skip;
const redisUrl =
  process.env.REDIS_URL ??
  createRedisUrl(
    process.env.REDIS_HOST ?? '127.0.0.1',
    process.env.REDIS_PORT ?? '6379',
    process.env.REDIS_PASSWORD,
  );

describeRedis('Redis Streams recovery contract', () => {
  let redis: Redis;
  let prefix: string;
  let connected = false;

  beforeEach(async () => {
    connected = false;
    redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    redis.on('error', () => undefined);
    try {
      await redis.connect();
      connected = true;
    } catch (error) {
      throw new Error(
        'Redis Streams integration requires a reachable disposable Redis server. Set REDIS_URL or start Redis before running test:queue.',
        { cause: error },
      );
    }
    prefix = `test:queue:${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  });

  afterEach(async () => {
    if (connected && redis.status === 'ready') {
      await redis.del(prefix, `${prefix}:dlq`);
    }
    redis.disconnect(false);
  });

  it.each(['transcode', 'completion'])(
    '%s: reclaims a message after consumer crash and dead-letters it at the delivery limit',
    async (queue) => {
      const stream = prefix;
      const group = 'production-test';
      const deadConsumer = 'crashed-before-ack';
      const liveConsumer = 'reclaimer';
      const payload = JSON.stringify({ song_id: 'song-1' });
      const maxDeliveries = 3;

      await redis.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
      const messageId = await redis.xadd(stream, '*', 'payload', payload);
      if (!messageId)
        throw new Error('Redis did not return a stream message ID');

      // Consumer A reads then exits before ACK: entry must remain in the PEL.
      await redis.xreadgroup(
        'GROUP',
        group,
        deadConsumer,
        'COUNT',
        1,
        'STREAMS',
        stream,
        '>',
      );
      await new Promise((resolve) => setTimeout(resolve, 25));

      if (queue === 'transcode') {
        // The Rust worker uses JUSTID to choose one stale PEL entry, then a
        // normal XCLAIM to obtain its payload and increment delivery count.
        const [, claimedIds] = (await redis.call(
          'XAUTOCLAIM',
          stream,
          group,
          liveConsumer,
          10,
          '0-0',
          'COUNT',
          1,
          'JUSTID',
        )) as [string, string[], string[]];
        expect(claimedIds).toEqual([messageId]);

        const claimedEntries = (await redis.call(
          'XCLAIM',
          stream,
          group,
          liveConsumer,
          0,
          messageId,
        )) as [string, [string, string][]][];
        expect(claimedEntries.map(([id]) => id)).toEqual([messageId]);
      } else {
        // Completion and cleanup consumers reclaim the full stream entry.
        // Do not use JUSTID here: it deliberately bypasses the delivery
        // counter, allowing crash-only retries to evade the DLQ limit.
        const [, claimedEntries] = (await redis.call(
          'XAUTOCLAIM',
          stream,
          group,
          liveConsumer,
          10,
          '0-0',
          'COUNT',
          1,
        )) as RedisAutoClaimResponse;
        expect(claimedEntries.map(([id]) => id)).toEqual([messageId]);
        expect(streamField(claimedEntries[0], 'payload')).toBe(payload);
      }

      // Every production reclaim strategy must count as a re-delivery.
      const afterReclaim = (await redis.call(
        'XPENDING',
        stream,
        group,
        messageId,
        messageId,
        1,
      )) as [string, string, number, number][];
      expect(Number(afterReclaim[0]?.[3] ?? 0)).toBe(2);

      // A failed handler leaves the entry pending. Re-delivery increments the
      // Redis delivery count, which is the retry authority across crashes.
      while (true) {
        const pending = (await redis.call(
          'XPENDING',
          stream,
          group,
          messageId,
          messageId,
          1,
        )) as [string, string, number, number][];
        const deliveries = Number(pending[0]?.[3] ?? 0);
        if (deliveries >= maxDeliveries) {
          const transaction = await redis
            .multi()
            .xadd(
              `${stream}:dlq`,
              '*',
              'payload',
              payload,
              'source_stream',
              stream,
              'source_id',
              messageId,
              'deliveries',
              String(deliveries),
              'error',
              'forced test failure',
            )
            .xack(stream, group, messageId)
            .exec();
          expect(transaction?.every(([error]) => error === null)).toBe(true);
          break;
        }
        await redis.xreadgroup(
          'GROUP',
          group,
          liveConsumer,
          'COUNT',
          1,
          'STREAMS',
          stream,
          '0',
        );
      }

      const pendingSummary = await redis.xpending(stream, group);
      expect(pendingSummary[0]).toBe(0);
      const dlq = await redis.xrange(`${stream}:dlq`, '-', '+');
      expect(dlq).toHaveLength(1);
      expect(dlq[0]?.[1]).toEqual(
        expect.arrayContaining([
          'source_id',
          messageId,
          'deliveries',
          String(maxDeliveries),
        ]),
      );
    },
  );
});

function createRedisUrl(
  host: string,
  port: string,
  password: string | undefined,
): string {
  const auth = password ? `:${encodeURIComponent(password)}@` : '';
  return `redis://${auth}${host}:${port}`;
}
