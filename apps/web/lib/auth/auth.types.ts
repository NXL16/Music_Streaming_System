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
  username: string;
  password: string;
  deviceId?: string;
};
