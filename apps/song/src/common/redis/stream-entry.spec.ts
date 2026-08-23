import { streamField } from './stream-entry';

describe('streamField', () => {
  it('reads the flat field list returned by ioredis for Redis Streams', () => {
    expect(
      streamField(
        ['1730000000000-0', ['payload', '{"song_id":"song-1"}', 'kind', 'completion']],
        'payload',
      ),
    ).toBe('{"song_id":"song-1"}');
  });

  it('keeps compatibility with tuple-shaped test doubles', () => {
    expect(
      streamField(
        ['1730000000000-0', [['payload', '{"song_id":"song-1"}']]],
        'payload',
      ),
    ).toBe('{"song_id":"song-1"}');
  });
});
