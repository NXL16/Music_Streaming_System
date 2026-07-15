"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage } from "@/lib/api/api-error";
import {
  listSessions,
  logoutAll,
  logoutDevice,
} from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";
import type { SessionDevice } from "@/lib/auth/auth.types";

export function useSessions() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [sessions, setSessions] = useState<SessionDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionDeviceId, setActionDeviceId] = useState("");
  const [logoutAllLoading, setLogoutAllLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadSessions() {
    setError("");
    setLoading(true);

    try {
      const result = await listSessions();
      setSessions(result.data.sessions);
    } catch (error) {
      setError(
        getApiErrorMessage(
          error,
          "Khong the tai danh sach phien dang nhap.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function revokeDevice(deviceId: string) {
    setError("");
    setActionDeviceId(deviceId);

    try {
      await logoutDevice({ deviceId });
      await loadSessions();
    } catch (error) {
      setError(
        getApiErrorMessage(error, "Khong the dang xuat thiet bi nay."),
      );
    } finally {
      setActionDeviceId("");
    }
  }

  async function revokeAllSessions() {
    setError("");
    setLogoutAllLoading(true);

    try {
      await logoutAll();
      clearSession();
      router.push("/login");
    } catch (error) {
      setError(
        getApiErrorMessage(
          error,
          "Khong the dang xuat tat ca thiet bi.",
        ),
      );
    } finally {
      setLogoutAllLoading(false);
    }
  }

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    queueMicrotask(() => void loadSessions());
  }, [status]);

  return {
    sessions,
    loading,
    error,
    actionDeviceId,
    logoutAllLoading,
    reload: loadSessions,
    revokeDevice,
    revokeAllSessions,
  };
}
