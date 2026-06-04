import { http } from "@/lib/api/http";
import type {
  ApiResponse,
  AuthSession,
  LoginPayload,
  SignupPayload,
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

export async function refreshSession() {
  const response = await http.post<ApiResponse<AuthSession>>("/auth/refresh");

  return response.data;
}

export async function logout() {
  const response =
    await http.post<ApiResponse<Record<string, never>>>("/auth/logout");

  return response.data;
}
