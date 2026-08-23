export const USER_PROVISIONING_EVENT_TYPES = {
  metadata: 'USER_METADATA_PROVISION',
  wallet: 'USER_WALLET_PROVISION',
} as const;

export type UserProvisioningEventType =
  (typeof USER_PROVISIONING_EVENT_TYPES)[keyof typeof USER_PROVISIONING_EVENT_TYPES];
