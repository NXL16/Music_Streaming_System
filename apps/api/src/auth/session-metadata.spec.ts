import type { Request } from 'express';
import { getSessionMetadata } from './session-metadata';

function requestWith(
  ipAddress: string | undefined,
  userAgent: string | undefined,
): Request {
  return {
    socket: { remoteAddress: ipAddress },
    get: (header: string) => (header === 'user-agent' ? userAgent : undefined),
  } as unknown as Request;
}

describe('getSessionMetadata', () => {
  it('captures a direct peer address and user agent', () => {
    expect(
      getSessionMetadata(requestWith('::1', 'Mozilla/5.0 Chrome/140.0')),
    ).toEqual({
      ipAddress: '::1',
      userAgent: 'Mozilla/5.0 Chrome/140.0',
    });
  });

  it('rejects malformed addresses and limits safe user-agent metadata', () => {
    const metadata = getSessionMetadata(
      requestWith('127.0.0.1\r\nforged', `Browser\n${'a'.repeat(600)}`),
    );

    expect(metadata.ipAddress).toBeUndefined();
    expect(metadata.userAgent).toHaveLength(512);
    expect(metadata.userAgent).not.toContain('\n');
  });

  it('omits unavailable metadata', () => {
    expect(getSessionMetadata(requestWith(undefined, undefined))).toEqual({
      ipAddress: undefined,
      userAgent: undefined,
    });
  });
});
