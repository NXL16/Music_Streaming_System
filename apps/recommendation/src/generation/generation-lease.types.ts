export const GENERATION_LEASE_LOST_MESSAGE =
  'Recommendation generation lease is no longer held';

export type GenerationLease = {
  leaseKey: string;
  leaseToken: string;
};
