"use client";

import { Laptop, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { formatDateTime } from "@/lib/format/date";
import { useSessions } from "@/lib/auth/use-sessions";

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
    reload,
    revokeDevice,
    revokeAllSessions,
  } = useSessions();

  return (
    <section className={`${className}`}>
      <div className="flex flex-col gap-5 pb-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-(--systemSecondary) [font:var(--subhead-emphasized)]">
            ACCOUNT SECURITY
          </p>
          <h2 className="mt-1 text-(--systemPrimary) [font:var(--title-2-emphasized)]">
            Signed-in devices
          </h2>
          <p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">
            Manage your signed-in sessions and sign out other devices when needed.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-(--labelDivider) px-3.5 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)] transition hover:bg-(--systemQuinary) disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Refresh"}
          </button>

          <button
            type="button"
            onClick={() => void revokeAllSessions()}
            disabled={logoutAllLoading}
            className="inline-flex items-center gap-2 rounded-full bg-(--keyColor) px-3.5 py-2 text-(--keyColorText) [font:var(--callout-emphasized)] transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {logoutAllLoading ? "Signing out…" : "Sign out all"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-5 text-(--keyColor) [font:var(--callout)]">
          {error}
        </div>
      )}

      <div className="mt-6 divide-y divide-(--labelDivider)">
        {sessions.length === 0 && !loading && (
          <div className="py-8 text-(--systemSecondary) [font:var(--callout)]">
            No signed-in sessions yet.
          </div>
        )}

        {sessions.map((session) => (
          <div
            key={session.deviceId}
            className="group grid gap-4 py-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-(--systemQuinary) text-(--systemPrimary)">
              <Laptop className="h-5 w-5" strokeWidth={1.75} />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
                  {deviceLabel(session.userAgent)}
                </p>
                {session.isCurrent && (
                  <span className="rounded-full bg-(--systemQuaternary) px-2.5 py-1 text-(--systemPrimary) [font:var(--subhead-emphasized)]">
                    Current
                  </span>
                )}
              </div>
              <p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">
                Last active {formatDateTime(session.lastSeenAt)}
              </p>
            </div>

            {session.isCurrent ? (
              <span className="inline-flex items-center gap-2 text-(--statusPositive) [font:var(--callout-emphasized)]">
                <ShieldCheck className="h-4 w-4" /> In use
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void revokeDevice(session.deviceId)}
                disabled={actionDeviceId === session.deviceId}
                className="justify-self-start rounded-full border border-(--labelDivider) px-3.5 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)] transition hover:border-(--keyColor) hover:text-(--keyColor) disabled:cursor-not-allowed disabled:opacity-50 sm:justify-self-end"
              >
                {actionDeviceId === session.deviceId ? "Signing out…" : "Sign out"}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
