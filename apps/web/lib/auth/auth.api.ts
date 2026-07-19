import { http } from "@/lib/api/http";
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

export async function signup(payload: SignupPayload) {
  const response = await http.post<ApiResponse<AuthSession>>(
    "/auth/signup",
    payload,
  );

  return response.data;
}

export async function login(payload: LoginPayload) {
  const response = await http.post<ApiResponse<AuthSession>>(
    "/auth/login",
    payload,
  );

  return response.data;
}

export async function loginWithGoogle(payload: GoogleLoginPayload) {
  const response = await http.post<ApiResponse<AuthSession>>(
    "/auth/google/login",
    payload,
  );

  return response.data;
}

export async function verifyTwoFactorLogin(payload: TwoFactorLoginPayload) {
  const response = await http.post<ApiResponse<AuthSession>>(
    "/auth/2fa/login",
    payload,
  );

  return response.data;
}

export async function beginTwoFactorSetup() {
  const response = await http.post<ApiResponse<BeginTwoFactorSetupResponse>>(
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
  const response = await http.get<ApiResponse<UserProfile>>("/auth/me");

  return response.data;
}

export async function updateProfile(payload: UpdateProfilePayload) {
  const response = await http.patch<ApiResponse<UserProfile>>(
    "/auth/me",
    payload,
  );

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
