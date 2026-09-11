#!/usr/bin/env node
/*
 * Read-only pre-production audit for Redis and MongoDB.
 * It deliberately reports aggregates only: never connection strings, tokens,
 * document contents, user identifiers, or Redis key values.
 */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const workspace = process.cwd();
const songRequire = createRequire(path.join(workspace, 'apps/song/package.json'));
const identityRequire = createRequire(
  path.join(workspace, 'apps/identity/package.json'),
);
const Redis = songRequire('ioredis');

function readEnv(text) {
  const values = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

async function envAt(relativePath) {
  return readEnv(await readFile(path.join(workspace, relativePath), 'utf8'));
}

function integer(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : 0;
}

function keyFamily(key) {
  // Keep diagnostics useful without ever emitting user IDs, tokens, or values.
  return key.split(':').slice(0, 2).join(':') || '(unscoped)';
}

async function auditRedis() {
  const env = await envAt('apps/song/.env');
  const client = new Redis({
    host: env.get('REDIS_HOST'),
    port: integer(env.get('REDIS_PORT')) || 6379,
    password: env.get('REDIS_PASSWORD') || undefined,
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    lazyConnect: true,
  });

  try {
    await client.connect();
    const typeCounts = new Map();
    const ttl = { expiring: 0, persistent: 0, missing: 0 };
    const persistentByType = new Map();
    const persistentFamilies = new Map();
    const streamStats = [];
    let cursor = '0';
    do {
      const [next, keys] = await client.scan(cursor, 'COUNT', 200);
      cursor = next;
      for (const key of keys) {
        const [type, keyTtl] = await Promise.all([client.type(key), client.ttl(key)]);
        typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
        if (keyTtl === -1) {
          ttl.persistent += 1;
          persistentByType.set(type, (persistentByType.get(type) ?? 0) + 1);
          const family = keyFamily(key);
          persistentFamilies.set(family, (persistentFamilies.get(family) ?? 0) + 1);
        }
        else if (keyTtl === -2) ttl.missing += 1;
        else ttl.expiring += 1;

        if (type === 'stream') {
          const groups = await client.xinfo('GROUPS', key);
          const pending = Array.isArray(groups)
            ? groups.reduce((total, group) => {
                const fields = Array.isArray(group) ? group : [];
                const pendingIndex = fields.findIndex((value) => value === 'pending');
                return total + (pendingIndex < 0 ? 0 : integer(fields[pendingIndex + 1]));
              }, 0)
            : 0;
          streamStats.push({ entries: integer(await client.xlen(key)), groups: groups.length, pending });
        }
      }
    } while (cursor !== '0');

    return {
      keyTypes: Object.fromEntries([...typeCounts.entries()].sort()),
      ttl,
      persistentByType: Object.fromEntries([...persistentByType.entries()].sort()),
      persistentFamilies: Object.fromEntries([...persistentFamilies.entries()].sort()),
      streams: {
        count: streamStats.length,
        entries: streamStats.reduce((total, stream) => total + stream.entries, 0),
        groups: streamStats.reduce((total, stream) => total + stream.groups, 0),
        pending: streamStats.reduce((total, stream) => total + stream.pending, 0),
      },
    };
  } finally {
    await client.quit().catch(() => client.disconnect());
  }
}

async function auditMongoDatabase(label, uri, databaseName, collectionName, checks) {
  // MongoDB is intentionally reached through Identity's declared dependency
  // (`mongoose`), not through its transitive `mongodb` package. pnpm's strict
  // linker correctly prevents tools from importing undeclared dependencies.
  const mongoose = identityRequire('mongoose');
  const MongoClient = mongoose.mongo.MongoClient;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
  try {
    await client.connect();
    const database = client.db(databaseName);
    const collections = await database.listCollections({}, { nameOnly: true }).toArray();
    const collection = database.collection(collectionName);
    const [count, indexes, integrity] = await Promise.all([
      collection.countDocuments(),
      collection.indexes(),
      checks(collection),
    ]);
    return {
      label,
      database: databaseName,
      collections: collections.map(({ name }) => name).sort(),
      primaryCollection: collectionName,
      documents: count,
      indexes: indexes.map((index) => ({
        name: index.name,
        key: index.key,
        unique: Boolean(index.unique),
      })),
      integrity,
    };
  } finally {
    await client.close();
  }
}

async function auditMongo() {
  const [identityEnv, metaEnv] = await Promise.all([
    envAt('apps/identity/.env'),
    envAt('apps/meta/.env'),
  ]);
  return Promise.all([
    auditMongoDatabase(
      'Identity metadata',
      identityEnv.get('MONGODB_URI'),
      new URL(identityEnv.get('MONGODB_URI')).pathname.slice(1),
      'user_metadata',
      async (collection) => {
        const [missingUserId, duplicates] = await Promise.all([
          collection.countDocuments({ $or: [{ userId: { $exists: false } }, { userId: null }] }),
          collection
            .aggregate([
              { $group: { _id: '$userId', count: { $sum: 1 } } },
              { $match: { _id: { $ne: null }, count: { $gt: 1 } } },
              { $count: 'count' },
            ])
            .toArray(),
        ]);
        return { missingUserId, duplicateUserIds: duplicates[0]?.count ?? 0 };
      },
    ),
    auditMongoDatabase(
      'Media metadata',
      metaEnv.get('MONGO_URI'),
      metaEnv.get('MONGO_DB_NAME'),
      'song_metadata',
      async (collection) => {
        const [missingSongId, legacyWithoutVariant, duplicates] = await Promise.all([
          collection.countDocuments({
            $or: [{ song_id: { $exists: false } }, { song_id: null }],
          }),
          // The Meta repository intentionally treats a missing variant as the
          // legacy mixed stream. Report it separately so it is not mistaken
          // for a malformed document before the backfill is scheduled.
          collection.countDocuments({
            $or: [{ variant: { $exists: false } }, { variant: null }],
          }),
          collection
            .aggregate([
              { $group: { _id: { song_id: '$song_id', variant: '$variant' }, count: { $sum: 1 } } },
              { $match: { count: { $gt: 1 } } },
              { $count: 'count' },
            ])
            .toArray(),
        ]);
        return {
          missingSongId,
          legacyWithoutVariant,
          duplicateSongVariants: duplicates[0]?.count ?? 0,
        };
      },
    ),
  ]);
}

try {
  const result = { redis: await auditRedis() };
  try {
    result.mongo = await auditMongo();
  } catch (error) {
    result.mongo = {
      auditError: error instanceof Error ? error.message : String(error),
    };
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`Audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
