export const ROOM_MEDIA_AUDIENCE = 'room-media';
export const ROOM_MEDIA_CLIENT_SECRET_HEADER = 'x-room-media-client-secret';

export const ROOM_MEDIA_CONFIG = {
  clientSecret: 'ROOM_MEDIA_CLIENT_SECRET',
  ticketSecret: 'ROOM_MEDIA_TICKET_SECRET',
  publicBaseUrl: 'ROOM_MEDIA_PUBLIC_BASE_URL',
  ticketTtlSeconds: 'ROOM_MEDIA_TICKET_TTL_SECONDS',
} as const;

export const ROOM_MEDIA_TICKET_TTL = {
  defaultSeconds: 600,
  minSeconds: 60,
  maxSeconds: 900,
} as const;

export const ROOM_MEDIA_CATALOG_LIMIT = {
  default: 20,
  max: 50,
} as const;
