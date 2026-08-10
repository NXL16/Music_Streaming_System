import { http } from "@/lib/api/http";
import {
  getCachedQuery,
  invalidateCachedQuery,
  setCachedQuery,
} from "@/lib/api/query-cache";
import { clearClientSessionCache } from "./session-cache";
import type {
  ApiResponse,
  AuthSession,
  UserProfile,
  SignupPayload,
  LoginPayload,
  TwoFactorLoginPayload,
  GoogleLoginPayload,
  ForgotPasswordPayload,
  ResetPasswordPayload,
  UpdateProfilePayload,
  AvatarUploadPayload,
  AvatarUploadResponse,
  AvatarFinalizeResponse,
  ChangePasswordPayload,
  ListSessionsResponse,
  LogoutDevicePayload,
  VerifyEmailPayload,
  BeginTwoFactorSetupResponse,
  ConfirmTwoFactorSetupPayload,
  ConfirmTwoFactorSetupResponse,
  DisableTwoFactorPayload,
  RegenerateTwoFactorRecoveryCodesPayload,
  TwoFactorRecoveryCodesResponse,
  ListAdminUsersQuery,
  ListAdminUsersResponse,
  UserRole,
} from "./auth.types";

const PROFILE_KEY = "auth:profile";
const PROFILE_TTL_MS = 5 * 60 * 1000;

export async function signup(payload: SignupPayload) {
  const response = await http.post<ApiResponse<AuthSession>>(
    "/auth/signup",
    payload,
  );

  clearClientSessionCache();
  return response.data;
}

export async function login(payload: LoginPayload) {
  const response = await http.post<ApiResponse<AuthSession>>(
    "/auth/login",
    payload,
  );

  clearClientSessionCache();
  return response.data;
}

export async function loginWithGoogle(payload: GoogleLoginPayload) {
  const response = await http.post<ApiResponse<AuthSession>>(
    "/auth/google/login",
    payload,
  );

  clearClientSessionCache();
  return response.data;
}

export async function verifyTwoFactorLogin(payload: TwoFactorLoginPayload) {
  const response = await http.post<ApiResponse<AuthSession>>(
    "/auth/2fa/login",
    payload,
  );

  clearClientSessionCache();
  return response.data;
}

export async function beginTwoFactorSetup() {
  const response =
    await http.post<ApiResponse<BeginTwoFactorSetupResponse>>(
      "/auth/2fa/setup",
    );

  return response.data;
}

export async function confirmTwoFactorSetup(
  payload: ConfirmTwoFactorSetupPayload,
) {
  const response = await http.post<ApiResponse<ConfirmTwoFactorSetupResponse>>(
    "/auth/2fa/confirm",
    payload,
  );

  return response.data;
}

export async function disableTwoFactor(payload: DisableTwoFactorPayload) {
  const response = await http.post<ApiResponse<UserProfile>>(
    "/auth/2fa/disable",
    payload,
  );

  return response.data;
}

export async function regenerateTwoFactorRecoveryCodes(
  payload: RegenerateTwoFactorRecoveryCodesPayload,
) {
  const response = await http.post<ApiResponse<TwoFactorRecoveryCodesResponse>>(
    "/auth/2fa/recovery-codes/regenerate",
    payload,
  );

  return response.data;
}

export async function getProfile() {
  return getCachedQuery(
    PROFILE_KEY,
    async () => (await http.get<ApiResponse<UserProfile>>("/auth/me")).data,
    PROFILE_TTL_MS,
  );
}

export async function updateProfile(payload: UpdateProfilePayload) {
  const response = await http.patch<ApiResponse<UserProfile>>(
    "/auth/me",
    payload,
  );

  setCachedQuery(PROFILE_KEY, response.data, PROFILE_TTL_MS);
  return response.data;
}

export async function requestAvatarUpload(payload: AvatarUploadPayload) {
  const response = await http.post<ApiResponse<AvatarUploadResponse>>(
    "/auth/me/avatar/uploads",
    payload,
  );
  return response.data;
}

export async function finalizeAvatarUpload(assetId: string) {
  const response = await http.post<ApiResponse<AvatarFinalizeResponse>>(
    `/auth/me/avatar/${encodeURIComponent(assetId)}/finalize`,
  );
  invalidateCachedQuery(PROFILE_KEY);
  return response.data;
}

export async function changePassword(payload: ChangePasswordPayload) {
  const response = await http.post<ApiResponse<Record<string, never>>>(
    "/auth/change-password",
    payload,
  );

  return response.data;
}

export async function forgotPassword(payload: ForgotPasswordPayload) {
  const response = await http.post<ApiResponse<{ success: boolean }>>(
    "/auth/password/forgot",
    payload,
  );

  return response.data;
}

export async function resetPassword(payload: ResetPasswordPayload) {
  const response = await http.post<ApiResponse<Record<string, never>>>(
    "/auth/password/reset",
    payload,
  );

  return response.data;
}

export async function logout() {
  const response =
    await http.post<ApiResponse<Record<string, never>>>("/auth/logout");

  clearClientSessionCache();
  return response.data;
}

export async function listSessions() {
  const response =
    await http.get<ApiResponse<ListSessionsResponse>>("/auth/sessions");

  return response.data;
}

export async function logoutDevice(payload: LogoutDevicePayload) {
  const response = await http.post<ApiResponse<Record<string, never>>>(
    "/auth/logout-device",
    payload,
  );

  return response.data;
}

export async function logoutAll() {
  const response =
    await http.post<ApiResponse<Record<string, never>>>("/auth/logout-all");

  clearClientSessionCache();
  return response.data;
}

export async function requestEmailVerification() {
  const response = await http.post<ApiResponse<Record<string, never>>>(
    "/auth/email/request-verification",
  );

  return response.data;
}

export async function verifyEmail(payload: VerifyEmailPayload) {
  const response = await http.post<ApiResponse<UserProfile>>(
    "/auth/email/verify",
    payload,
  );

  return response.data;
}

export async function listAdminUsers(query: ListAdminUsersQuery = {}) {
  const response = await http.get<ApiResponse<ListAdminUsersResponse>>(
    "/auth/admin/users",
    { params: query },
  );

  return response.data;
}

export async function getAdminUser(userId: string) {
  const response = await http.get<ApiResponse<UserProfile>>(
    `/auth/admin/users/${encodeURIComponent(userId)}`,
  );

  return response.data;
}

export async function setAdminUserStatus(userId: string, isActive: boolean) {
  const response = await http.patch<ApiResponse<UserProfile>>(
    `/auth/admin/users/${encodeURIComponent(userId)}/status`,
    { isActive },
  );

  return response.data;
}

export async function setAdminUserRole(userId: string, role: UserRole) {
  const response = await http.patch<ApiResponse<UserProfile>>(
    `/auth/admin/users/${encodeURIComponent(userId)}/role`,
    { role },
  );

  return response.data;
}

export async function revokeAdminUserSessions(userId: string) {
  const response = await http.post<ApiResponse<Record<string, never>>>(
    `/auth/admin/users/${encodeURIComponent(userId)}/revoke-sessions`,
  );

  return response.data;
}

export async function resetAdminUserTwoFactor(userId: string) {
  const response = await http.post<ApiResponse<UserProfile>>(
    `/auth/admin/users/${encodeURIComponent(userId)}/reset-2fa`,
  );

  return response.data;
}
