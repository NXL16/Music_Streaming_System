import type { Request } from 'express';
import { isIP } from 'node:net';

export type SessionMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

const IP_ADDRESS_MAX_LENGTH = 64;
const USER_AGENT_MAX_LENGTH = 512;

/**
 * Captures only direct peer information. A deployment behind a reverse proxy
 * must explicitly configure Express trust-proxy before switching to req.ip.
 */
export function getSessionMetadata(req: Request): SessionMetadata {
  return {
    ipAddress: normalizeIpAddress(req.socket.remoteAddress),
    userAgent: sanitizeUserAgent(req.get('user-agent')),
  };
}

function normalizeIpAddress(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && isIP(normalized)
    ? normalized.slice(0, IP_ADDRESS_MAX_LENGTH)
    : undefined;
}

function sanitizeUserAgent(value: string | undefined): string | undefined {
  // gRPC ASCII metadata cannot safely transport control or non-ASCII bytes.
  const normalized = value?.replace(/[^\x20-\x7e]/g, '').trim();
  return normalized ? normalized.slice(0, USER_AGENT_MAX_LENGTH) : undefined;
}
