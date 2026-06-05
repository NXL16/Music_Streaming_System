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

export async function refreshSession() {
  const response = await http.post<ApiResponse<AuthSession>>("/auth/refresh");

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
