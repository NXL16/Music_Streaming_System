"use client";

import { formatDateTime } from "@/lib/format/date";
import { useSessions } from "@/lib/auth/use-sessions";

function shortDeviceId(deviceId: string) {
  if (deviceId.length <= 12) {
    return deviceId;
  }

  return `${deviceId.slice(0, 8)}...${deviceId.slice(-4)}`;
}

export function SessionsPanel() {
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
    <section className="mt-6 rounded-4xl border border-[#ead4bd] bg-white p-6 shadow-[0_24px_80px_rgba(95,55,25,0.1)] md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b65f38]">
            Sessions
          </p>
          <h2 className="mt-2 text-3xl font-black">Thiết bị đăng nhập</h2>
          <p className="mt-2 text-[#705846]">
            Quản lý các phiên đăng nhập và đăng xuất thiết bị khác khi cần.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="rounded-2xl border border-[#ead4bd] px-5 py-3 font-bold transition hover:border-[#c45f36] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Đang tải..." : "Refresh"}
          </button>

          <button
            type="button"
            onClick={() => void revokeAllSessions()}
            disabled={logoutAllLoading}
            className="rounded-2xl bg-[#23170f] px-5 py-3 font-bold text-white transition hover:bg-[#3a2a1f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {logoutAllLoading ? "Đang đăng xuất..." : "Logout all"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {sessions.length === 0 && !loading ? (
          <div className="rounded-3xl border border-[#ead4bd] bg-[#fffaf4] px-5 py-4 text-sm font-semibold text-[#705846]">
            Chưa có phiên đăng nhập nào.
          </div>
        ) : null}

        {sessions.map((session) => (
          <div
            key={session.deviceId}
            className="rounded-3xl border border-[#ead4bd] bg-[#fffaf4] p-5"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-all font-black">
                    {shortDeviceId(session.deviceId)}
                  </p>

                  {session.isCurrent ? (
                    <span className="rounded-full bg-[#23170f] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
                      Current
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 wrap-break-word text-sm font-semibold text-[#705846]">
                  {session.userAgent || "Unknown user agent"}
                </p>

                <div className="mt-3 grid gap-2 text-sm text-[#705846] sm:grid-cols-2">
                  <p>
                    <span className="font-bold text-[#23170f]">IP:</span>{" "}
                    {session.ipAddress || "Unknown"}
                  </p>
                  <p>
                    <span className="font-bold text-[#23170f]">Last seen:</span>{" "}
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
                className="rounded-2xl border border-[#ead4bd] px-4 py-2 font-bold transition hover:border-[#c45f36] disabled:cursor-not-allowed disabled:opacity-50"
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
