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
  avatar?: string;
  bio: string;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt?: number;
  updatedAt: number;
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
  credential: string;
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
  avatar?: string;
  bio?: string;
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
