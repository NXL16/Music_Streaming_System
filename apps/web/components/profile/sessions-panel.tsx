"use client";

import { formatDateTime } from "@/lib/format/date";
import { useSessions } from "@/lib/auth/use-sessions";

function shortDeviceId(deviceId: string) {
  if (deviceId.length <= 12) {
    return deviceId;
  }

  return `${deviceId.slice(0, 8)}...${deviceId.slice(-4)}`;
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
    <section className={`${className} border-t border-(--labelDivider) pt-5`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
            Thiết bị đăng nhập
          </p>
          <p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">
            Quản lý các phiên đăng nhập và đăng xuất thiết bị khác khi cần.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="rounded-full border border-(--labelDivider) bg-(--systemQuinary) px-4 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Đang tải..." : "Refresh"}
          </button>

          <button
            type="button"
            onClick={() => void revokeAllSessions()}
            disabled={logoutAllLoading}
            className="rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {logoutAllLoading ? "Đang đăng xuất..." : "Logout all"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-5 text-(--keyColor) [font:var(--callout)]">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {sessions.length === 0 && !loading && (
          <div className="py-5 text-(--systemSecondary) [font:var(--callout)]">
            Chưa có phiên đăng nhập nào.
          </div>
        )}

        {sessions.map((session) => (
          <div
            key={session.deviceId}
            className="border-t border-(--labelDivider) py-5"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-all text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
                    {shortDeviceId(session.deviceId)}
                  </p>

                  {session.isCurrent && (
                    <span className="rounded-full bg-(--systemQuaternary) px-3 py-1 text-(--systemPrimary) [font:var(--subhead-emphasized)]">
                      Current
                    </span>
                  )}
                </div>

                <p className="mt-2 wrap-break-word text-(--systemSecondary) [font:var(--callout)]">
                  {session.userAgent || "Unknown user agent"}
                </p>

                <div className="mt-3 grid gap-2 text-(--systemSecondary) [font:var(--callout)] sm:grid-cols-2">
                  <p>
                    <span className="text-(--systemPrimary) [font:var(--callout-emphasized)]">
                      IP:
                    </span>{" "}
                    {session.ipAddress || "Unknown"}
                  </p>
                  <p>
                    <span className="text-(--systemPrimary) [font:var(--callout-emphasized)]">
                      Last seen:
                    </span>{" "}
                    {formatDateTime(session.lastSeenAt)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void revokeDevice(session.deviceId)}
                disabled={
                  session.isCurrent || actionDeviceId === session.deviceId
                }
                className="rounded-full border border-(--labelDivider) bg-(--systemQuinary) px-4 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionDeviceId === session.deviceId
                  ? "Đăng xuất..."
                  : session.isCurrent
                    ? "Thiết bị hiện tại"
                    : "Logout device"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
