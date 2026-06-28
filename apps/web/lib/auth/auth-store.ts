"use client";

import { create } from "zustand";
import type { UserProfile } from "./auth.types";
import { clearAccessToken, setAccessToken } from "./access-token-store";

type AuthStatus = "checking" | "authenticated" | "guest";

type AuthStore = {
  status: AuthStatus;
  user: UserProfile | null;
  accessTokenExpiresAt: number | null;
  sessionVersion: number;
  setSession: (
    accessToken: string,
    user: UserProfile,
    expiresIn: number,
  ) => void;
  setUser: (user: UserProfile) => void;
  clearSession: () => void;
  setGuest: () => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  status: "checking",
  user: null,
  accessTokenExpiresAt: null,
  sessionVersion: 0,

  setSession: (accessToken, user, expiresIn) => {
    setAccessToken(accessToken);
    set((state) => ({
      status: "authenticated",
      user,
      accessTokenExpiresAt: Date.now() + Math.max(expiresIn, 1) * 1000,
      sessionVersion: state.sessionVersion + 1,
    }));
  },

  setUser: (user) => {
    set({
      user,
    });
  },

  clearSession: () => {
    clearAccessToken();
    set((state) => ({
      status: "guest",
      user: null,
      accessTokenExpiresAt: null,
      sessionVersion: state.sessionVersion + 1,
    }));
  },

  setGuest: () => {
    clearAccessToken();
    set((state) => ({
      status: "guest",
      user: null,
      accessTokenExpiresAt: null,
      sessionVersion: state.sessionVersion + 1,
    }));
  },
}));
