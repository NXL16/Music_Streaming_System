export type ApiResponse<T> = {
  success: boolean;
  code: string;
  data: T;
  message: string;
  timestamp: string;
};

export type UserProfile = {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: number;
  avatarAssetId?: string;
  avatarUrl?: string;
  bio: string;
  isActive: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt?: number;
  updatedAt: number;
};

export type UserRole =
  | "USER"
  | "ARTIST"
  | "SUPER_ADMIN"
  | "ADMIN_USER_OPS"
  | "ADMIN_SECURITY_OPS";

export type ListAdminUsersQuery = {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  isActive?: boolean;
};

export type ListAdminUsersResponse = {
  users: UserProfile[];
  total: number;
  page: number;
  limit: number;
};

export type AuthSession = {
  accessToken: string;
  deviceId: string;
  expiresIn: number;
  user: UserProfile;
  twoFactorRequired: boolean;
  twoFactorChallengeId?: string;
};

export type SignupPayload = {
  username: string;
  email: string;
  password: string;
  displayName: string;
  deviceId?: string;
};

export type LoginPayload = {
  identifier: string;
  password: string;
  deviceId?: string;
};

export type TwoFactorLoginPayload = {
  challengeId: string;
  code?: string;
  recoveryCode?: string;
};

export type BeginTwoFactorSetupResponse = {
  secret: string;
  otpauthUrl: string;
};

export type ConfirmTwoFactorSetupPayload = {
  code: string;
};

export type ConfirmTwoFactorSetupResponse = {
  user: UserProfile;
  recoveryCodes: string[];
};

export type DisableTwoFactorPayload = {
  password: string;
  code?: string;
  recoveryCode?: string;
};

export type RegenerateTwoFactorRecoveryCodesPayload = {
  password: string;
  code?: string;
  recoveryCode?: string;
};

export type TwoFactorRecoveryCodesResponse = {
  recoveryCodes: string[];
};

export type GoogleLoginPayload = {
  code: string;
  deviceId?: string;
};

export type ForgotPasswordPayload = {
  email: string;
};

export type ResetPasswordPayload = {
  token: string;
  newPassword: string;
};

export type UpdateProfilePayload = {
  displayName: string;
  bio?: string;
};

export type AvatarUploadPayload = {
  filename: string;
  contentType: string;
  checksum: string;
  sizeBytes: number;
};

export type AvatarAsset = {
  id: string;
  status: number;
  publicUrl: string;
  errorMessage: string;
};

export type AvatarUploadResponse = {
  asset: AvatarAsset;
  uploadUrl: string;
  instant: boolean;
};

export type AvatarFinalizeResponse = {
  asset: AvatarAsset;
  user?: UserProfile;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

export type SessionDevice = {
  deviceId: string;
  isCurrent: boolean;
  ipAddress?: string;
  userAgent?: string;
  lastSeenAt: number;
};

export type ListSessionsResponse = {
  sessions: SessionDevice[];
};

export type LogoutDevicePayload = {
  deviceId: string;
};

export type VerifyEmailPayload = {
  token: string;
};
