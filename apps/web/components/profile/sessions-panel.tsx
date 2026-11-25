"use client";

import { Laptop, Smartphone, Tablet } from "lucide-react";
import { formatDateTime } from "@/lib/format/date";
import { useSessions } from "@/lib/auth/use-sessions";
import styles from "./security-settings.module.css";

function deviceLabel(userAgent?: string) {
  if (!userAgent) return "Unknown device";

  const browser = userAgent.includes("Edg/")
    ? "Microsoft Edge"
    : userAgent.includes("Firefox/")
      ? "Firefox"
      : userAgent.includes("Chrome/")
        ? "Google Chrome"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "Browser";
  const platform = userAgent.includes("Windows")
    ? "Windows"
    : userAgent.includes("Android")
      ? "Android"
      : /iPhone|iPad|iPod/.test(userAgent)
        ? "iPhone or iPad"
        : userAgent.includes("Mac OS X")
          ? "macOS"
          : "this device";

  return `${browser} on ${platform}`;
}

function DeviceIcon({ userAgent }: { userAgent?: string }) {
  if (userAgent && /iPad|Tablet/i.test(userAgent)) {
    return <Tablet size={22} aria-hidden="true" />;
  }
  if (userAgent && /iPhone|iPod|Android|Mobile/i.test(userAgent)) {
    return <Smartphone size={22} aria-hidden="true" />;
  }
  return <Laptop size={22} aria-hidden="true" />;
}

type SessionsPanelProps = {
  className?: string;
};

export function SessionsPanel({ className = "mt-6" }: SessionsPanelProps) {
  const {
    sessions,
    loading,
    error,
    actionDeviceId,
    logoutAllLoading,
    revokeDevice,
    revokeAllSessions,
  } = useSessions();

  const busy = logoutAllLoading || Boolean(actionDeviceId);
  return (
    <section className={className} aria-label="Signed-in devices">
      <div className={styles.devicesHeader}>
        <button
          type="button"
          onClick={() => void revokeAllSessions()}
          disabled={busy || loading || sessions.length === 0}
          className={styles.textButton}
        >
          {logoutAllLoading ? "Signing out..." : "Sign out all devices"}
        </button>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {loading && sessions.length === 0 && (
        <p role="status" className={styles.notice}>
          Loading devices...
        </p>
      )}
      {!loading && !error && sessions.length === 0 && (
        <p className={styles.notice}>No signed-in devices.</p>
      )}
      {sessions.map((session) => (
        <div key={session.deviceId} className={styles.device}>
          <DeviceIcon userAgent={session.userAgent} />
          <div>
            <p className={styles.deviceName}>
              {deviceLabel(session.userAgent)}
            </p>
            <p className={styles.description}>
              Last active {formatDateTime(session.lastSeenAt)}
            </p>
          </div>
          {session.isCurrent ? (
            <span className={styles.current}>This device</span>
          ) : (
            <button
              type="button"
              onClick={() => void revokeDevice(session.deviceId)}
              disabled={busy}
              className={styles.textButton}
              aria-label={"Sign out " + deviceLabel(session.userAgent)}
            >
              {actionDeviceId === session.deviceId
                ? "Signing out..."
                : "Sign out"}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
