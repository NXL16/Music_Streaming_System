"use client";

import { create } from "zustand";
import type { UserProfile } from "./auth.types";
import { clearAccessToken, setAccessToken } from "./access-token-store";

type AuthStatus = "checking" | "authenticated" | "guest";

type AuthStore = {
  status: AuthStatus;
  user: UserProfile | null;
  setSession: (accessToken: string, user: UserProfile) => void;
  setUser: (user: UserProfile) => void;
  clearSession: () => void;
  setGuest: () => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  status: "checking",
  user: null,

  setSession: (accessToken, user) => {
    setAccessToken(accessToken);
    set({
      status: "authenticated",
      user,
    });
  },

  setUser: (user) => {
    set({
      user,
    });
  },

  clearSession: () => {
    clearAccessToken();
    set({
      status: "guest",
      user: null,
    });
  },

  setGuest: () => {
    clearAccessToken();
    set({
      status: "guest",
      user: null,
    });
  },
}));
