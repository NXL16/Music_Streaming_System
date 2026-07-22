"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import {
  MusicPageHeading,
  MusicPageLayout,
} from "@/components/layout/music-page-layout";
import { listAdminUsers } from "@/lib/auth/auth.api";
import { getAdminListeningAnalytics } from "@/lib/admin/admin.api";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useSongLibrary } from "@/lib/songs/use-song-library";

const ADMIN_ROLES = new Set([
  "SUPER_ADMIN",
  "ADMIN_USER_OPS",
  "ADMIN_SECURITY_OPS",
]);

function sinceSaturdayAnalyticsWindowDays() {
  const today = new Date();
  const daysSinceSaturday = (today.getUTCDay() + 1) % 7;
  return daysSinceSaturday + 1;
}
function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function statusLabel(status: number) {
  switch (status) {
    case 3:
      return "Live";
    case 1:
    case 2:
      return "Processing";
    case 4:
      return "Needs attention";
    default:
      return "Draft";
  }
}

type TrendPoint = {
  date: string;
  plays: number;
  completions: number;
  skips: number;
  listeners: number;
};

function fillSinceSaturday(points: TrendPoint[]): TrendPoint[] {
  const byDate = new Map(points.map((point) => [point.date, point]));
  const today = new Date();
  const daysSinceSaturday = (today.getUTCDay() + 1) % 7;
  const result: TrendPoint[] = [];
  for (let offset = daysSinceSaturday; offset >= 0; offset -= 1) {
    const day = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - offset,
    ));
    const date = day.toISOString().slice(0, 10);
    result.push(
      byDate.get(date) ?? {
        date,
        plays: 0,
        completions: 0,
        skips: 0,
        listeners: 0,
      },
    );
  }
  return result;
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: number | string;
  note: string;
}) {
  return (
    <div className="border-t border-(--labelDivider) py-5">
      <p className="text-(--systemSecondary) [font:var(--callout)]">{label}</p>
      <p className="mt-1 text-(--systemPrimary) [font:var(--title-1-emphasized)]">
        {value}
      </p>
      <p className="mt-1 text-(--systemSecondary) [font:var(--footnote)]">
        {note}
      </p>
    </div>
  );
}

function TrendChart({
  points,
}: {
  points: Array<{
    date: string;
    plays: number;
    completions: number;
    skips: number;
    listeners: number;
  }>;
}) {
  const [hovered, setHovered] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const timeline = useMemo(() => fillSinceSaturday(points), [points]);
  if (!points.length)
    return (
      <div className="border-t border-(--labelDivider) py-10 text-center text-(--systemSecondary) [font:var(--callout)]">
        No listening activity in this period.
      </div>
    );
  const max = Math.max(
    1,
    ...timeline.flatMap((point) => [
      point.plays,
      point.completions,
      point.skips,
      point.listeners,
    ]),
  );
  const pointX = (index: number) =>
    timeline.length === 1 ? 50 : (index / (timeline.length - 1)) * 100;
  const pointY = (value: number) => 92 - (value / max) * 78;
  const line = (key: "plays" | "completions" | "skips" | "listeners") =>
    timeline
      .map(
        (point, index) =>
          `${pointX(index)},${pointY(point[key])}`,
      )
      .join(" ");
  const hoveredIndex = hovered?.index ?? null;
  const hoveredPoint = hoveredIndex === null ? null : timeline[hoveredIndex];

  const updateHoveredIndex = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const index = Math.round(ratio * (timeline.length - 1));
    setHovered({
      index,
      x: Math.min(window.innerWidth - 236, Math.max(12, event.clientX + 16)),
      y: Math.min(window.innerHeight - 166, Math.max(12, event.clientY + 16)),
    });
  };

  return (
    <div className="relative border-t border-(--labelDivider) pt-5">
      <div className="flex items-baseline justify-between">
        <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
          Listening trend
        </p>
        <span className="text-(--systemSecondary) [font:var(--footnote)]">
          Since Saturday
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-(--systemSecondary) [font:var(--footnote)]">
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-(--keyColor)" />Plays</span>
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-(--statusPositive)" />Completed</span>
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-(--systemSecondary)" />Skips</span>
        <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#5ac8fa]" />Listeners</span>
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="mt-4 h-52 w-full overflow-visible"
        role="img"
        aria-label="Listening trend chart"
        onMouseMove={updateHoveredIndex}
        onMouseLeave={() => setHovered(null)}
      >
        <line
          x1="0"
          y1="92"
          x2="100"
          y2="92"
          stroke="var(--labelDivider)"
          strokeWidth="0.7"
        />
        <line
          x1="0"
          y1="53"
          x2="100"
          y2="53"
          stroke="var(--labelDivider)"
          strokeWidth="0.5"
          strokeDasharray="2 2"
        />
        <polyline
          points={line("plays")}
          fill="none"
          stroke="var(--keyColor)"
          strokeWidth="2.2"
          vectorEffect="non-scaling-stroke"
        />
        <polyline points={line("completions")} fill="none" stroke="var(--statusPositive)" strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
        <polyline points={line("skips")} fill="none" stroke="var(--systemSecondary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polyline points={line("listeners")} fill="none" stroke="#5ac8fa" strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
        {/* SVG transparent areas do not consistently receive mouse events;
            this hit target makes every date column hoverable. */}
        <rect x="0" y="0" width="100" height="100" fill="transparent" pointerEvents="all" />
      </svg>
      {hoveredPoint && hovered && (
        <div style={{ left: hovered.x, top: hovered.y }} className="pointer-events-none fixed z-50 w-52 rounded-xl border border-(--labelDivider) bg-(--background) p-3 shadow-2xl">
          <p className="text-(--systemPrimary) [font:var(--footnote-emphasized)]">{hoveredPoint.date}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-(--systemSecondary) [font:var(--footnote)]">
            <dt>Plays</dt><dd className="text-right text-(--systemPrimary)">{hoveredPoint.plays}</dd>
            <dt>Completed</dt><dd className="text-right text-(--systemPrimary)">{hoveredPoint.completions}</dd>
            <dt>Skips</dt><dd className="text-right text-(--systemPrimary)">{hoveredPoint.skips}</dd>
            <dt>Listeners</dt><dd className="text-right text-(--systemPrimary)">{hoveredPoint.listeners}</dd>
          </dl>
        </div>
      )}
      <div className="mt-2 flex justify-between text-(--systemSecondary) [font:var(--footnote)]">
        <span>{timeline[0]?.date}</span>
        <span>{timeline.at(-1)?.date}</span>
      </div>
    </div>
  );
}

function StatusChart({
  values,
}: {
  values: Array<{ label: string; value: number; color: string }>;
}) {
  const total = Math.max(
    1,
    values.reduce((sum, value) => sum + value.value, 0),
  );
  return (
    <div className="mt-6 border-t border-(--labelDivider) pt-5">
      <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
        Release distribution
      </p>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-(--systemQuinary)">
        {values.map((item) => (
          <div
            key={item.label}
            style={{
              width: `${(item.value / total) * 100}%`,
              background: item.color,
            }}
            title={`${item.label}: ${item.value}`}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {values.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between text-(--systemSecondary) [font:var(--callout)]"
          >
            <span className="flex items-center gap-2">
              <i
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: item.color }}
              />
              {item.label}
            </span>
            <strong className="text-(--systemPrimary)">{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtistAnalytics() {
  const { songs, loading, error, refresh, hasMore } = useSongLibrary();
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "processing" | "attention">("all");
  const metrics = useMemo(() => {
    const safeSongs = songs ?? [];
    return {
      total: safeSongs.length,
      ready: safeSongs.filter((song) => song.status === 3).length,
      processing: safeSongs.filter(
        (song) => song.status === 1 || song.status === 2,
      ).length,
      failed: safeSongs.filter((song) => song.status === 4).length,
      public: safeSongs.filter((song) => song.isPublic).length,
    };
  }, [songs]);
  const visibleSongs = useMemo(() => {
    const safeSongs = songs ?? [];
    if (statusFilter === "live") return safeSongs.filter((song) => song.status === 3);
    if (statusFilter === "processing") return safeSongs.filter((song) => song.status === 1 || song.status === 2);
    if (statusFilter === "attention") return safeSongs.filter((song) => song.status === 4);
    return safeSongs;
  }, [songs, statusFilter]);

  return (
    <section className="box-border p-[0_var(--shelfGridPaddingInline,var(--bodyGutter))] relative w-full z-(--z-default)">
      <div className="items-center flex justify-end gap-3 m-[0_0_13px]">
        <div className="flex-1">
          <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
            Release health
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-(--systemQuinary) px-3 py-2 text-(--systemPrimary) [font:var(--footnote-emphasized)] transition hover:opacity-75 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      {error ? (
        <p className="text-(--keyColor) [font:var(--callout)]">
          Could not load your catalog analytics.
        </p>
      ) : (
        <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label={hasMore ? "Recent tracks" : "Tracks"}
            value={loading ? "—" : metrics.total}
            note={hasMore ? "Latest loaded releases; open Library for all" : "Your uploaded releases"}
          />
          <Metric
            label="Live"
            value={loading ? "—" : metrics.ready}
            note={hasMore ? "Among latest loaded releases" : "Ready for playback"}
          />
          <Metric
            label="Processing"
            value={loading ? "—" : metrics.processing}
            note={hasMore ? "Among latest loaded releases" : "Waiting for media processing"}
          />
          <Metric
            label="Needs attention"
            value={loading ? "—" : metrics.failed}
            note={hasMore ? "Among latest loaded releases" : "Processing failed"}
          />
          <Metric
            label="Public"
            value={loading ? "—" : metrics.public}
            note={hasMore ? "Among latest loaded releases" : "Visible to listeners"}
          />
        </div>
      )}
      {!loading && (
        <StatusChart
          values={[
            {
              label: "Live",
              value: metrics.ready,
              color: "var(--statusPositive)",
            },
            {
              label: "Processing",
              value: metrics.processing,
              color: "var(--keyColor)",
            },
            {
              label: "Needs attention",
              value: metrics.failed,
              color: "var(--systemRed)",
            },
          ]}
        />
      )}
      <div className="mt-6 border-t border-(--labelDivider) pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">Release queue</p>
            <p className="mt-1 text-(--systemSecondary) [font:var(--footnote)]">Your most recently loaded releases and their processing state.</p>
          </div>
          <Link className="inline-flex items-center gap-1 text-(--keyColor) [font:var(--callout-emphasized)]" href="/library">
            Manage releases <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Release status">
          {(
            [["all", "All"], ["live", "Live"], ["processing", "Processing"], ["attention", "Needs attention"]] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={statusFilter === value}
              onClick={() => setStatusFilter(value)}
              className={`shrink-0 rounded-full px-3 py-1.5 [font:var(--footnote-emphasized)] transition ${statusFilter === value ? "bg-(--systemPrimary) text-(--background)" : "bg-(--systemQuinary) text-(--systemSecondary) hover:text-(--systemPrimary)"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 divide-y divide-(--labelDivider) border-y border-(--labelDivider)">
          {visibleSongs.slice(0, 8).map((song) => (
            <Link key={song.id} href={`/song/${encodeURIComponent(song.id)}`} className="flex items-center justify-between gap-4 py-3 transition hover:opacity-70">
              <span className="min-w-0">
                <span className="block truncate text-(--systemPrimary) [font:var(--callout-emphasized)]">{song.title || "Untitled track"}</span>
                <span className="block truncate text-(--systemSecondary) [font:var(--footnote)]">{song.album || "Single"} · {song.isPublic ? "Public" : "Private"}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 [font:var(--footnote-emphasized)] ${song.status === 3 ? "bg-(--statusPositiveBackground) text-(--statusPositive)" : song.status === 4 ? "bg-(--statusNegativeBackground) text-(--keyColor)" : "bg-(--systemQuinary) text-(--systemSecondary)"}`}>{statusLabel(song.status)}</span>
            </Link>
          ))}
          {!loading && visibleSongs.length === 0 && (
            <p className="py-8 text-center text-(--systemSecondary) [font:var(--callout)]">No releases in this status.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function AdminAnalytics() {
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<Awaited<
    ReturnType<typeof getAdminListeningAnalytics>
  > | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const [usersResult, analyticsResult] = await Promise.allSettled([
      listAdminUsers({ page: 1, limit: 1 }),
      getAdminListeningAnalytics(sinceSaturdayAnalyticsWindowDays()),
    ]);
    if (usersResult.status === "fulfilled") {
      setTotalUsers(usersResult.value.data.total);
    }
    if (analyticsResult.status === "fulfilled") {
      setAnalytics(analyticsResult.value);
      setUpdatedAt(new Date());
    }
    if (usersResult.status === "rejected" || analyticsResult.status === "rejected") {
      setError("Some analytics could not be loaded. Check your admin permission or try again.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const previousWeekMetrics = useMemo(
    () =>
      analytics
        ? fillSinceSaturday(analytics.trend).reduce(
        (total, point) => ({
          plays: total.plays + point.plays,
          completions: total.completions + point.completions,
          skips: total.skips + point.skips,
          listeners: total.listeners + point.listeners,
        }),
        { plays: 0, completions: 0, skips: 0, listeners: 0 },
      )
        : null,
    [analytics],
  );
  const completionRate = previousWeekMetrics
    ? percentage(previousWeekMetrics.completions, previousWeekMetrics.plays)
    : 0;
  const skipRate = previousWeekMetrics
    ? percentage(previousWeekMetrics.skips, previousWeekMetrics.plays)
    : 0;

  return (
    <section className="box-border p-[0_var(--shelfGridPaddingInline,var(--bodyGutter))] relative w-full z-(--z-default)">
      <div className="items-center flex justify-end gap-3 m-[0_0_13px]">
        <div className="flex-1">
          <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
            System overview
          </h2>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-full bg-(--systemQuinary) px-3 py-2 text-(--systemPrimary) [font:var(--footnote-emphasized)] transition hover:opacity-75 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      <div className="mb-5 border-y border-(--labelDivider) py-3 text-(--systemSecondary) [font:var(--footnote)]">
        {updatedAt ? `Since Saturday · Updated ${updatedAt.toLocaleTimeString()}` : "Loading activity since Saturday…"}
      </div>
      {error && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl bg-(--statusNegativeBackground) px-4 py-3 text-(--keyColor)">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 [font:var(--callout)]">{error}</div>
          <button type="button" onClick={() => void refresh()} className="[font:var(--callout-emphasized)] underline">Retry</button>
        </div>
      )}
      <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Users"
          value={totalUsers ?? "—"}
          note="Accounts in Identity"
        />
        <Metric
          label="Plays (since Saturday)"
          value={previousWeekMetrics?.plays ?? "—"}
          note="Recorded play starts"
        />
        <Metric
          label="Listener days (since Saturday)"
          value={previousWeekMetrics?.listeners ?? "—"}
          note="Daily unique listeners summed"
        />
        <Metric
          label="Completion rate"
          value={analytics ? `${completionRate}%` : "—"}
          note="Completed listening events"
        />
        <Metric
          label="Skip rate"
          value={analytics ? `${skipRate}%` : "—"}
          note="Skipped listening events"
        />
      </div>
      {analytics && <TrendChart points={analytics.trend} />}
      {analytics?.topSongs.length ? (
        <div className="mt-6 border-t border-(--labelDivider) pt-5">
          <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
            Top songs in the latest activity window
          </p>
          <div className="mt-3 grid gap-2">
            {analytics.topSongs.slice(0, 10).map((song, index) => (
              <div
                key={song.songId}
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-(--labelDivider) py-3 text-(--systemPrimary) [font:var(--callout)] last:border-b-0"
              >
                <span className="text-(--systemSecondary) [font:var(--callout-emphasized)]">{index + 1}</span>
                <span className="min-w-0 truncate">
                  <span className="block truncate">{song.title || song.songId}</span>
                  <span className="text-(--systemSecondary)">
                    {song.artistName}
                  </span>
                </span>
                <span className="shrink-0 text-right text-(--systemSecondary) [font:var(--footnote)]">
                  {song.plays} plays · {song.listeners} listeners<br />
                  {percentage(song.completions, song.plays)}% complete · {percentage(song.skips, song.plays)}% skipped
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-6 border-t border-(--labelDivider) pt-5">
        <Link
          className="text-(--keyColor) [font:var(--callout-emphasized)]"
          href="/admin"
        >
          Open Admin workspace
        </Link>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = ADMIN_ROLES.has(user?.role ?? "");
  const isArtist = user?.role === "ARTIST";

  if (!isAdmin && !isArtist) {
    return (
      <div className="mx-auto max-w-2xl px-(--bodyGutter) py-16 text-(--systemPrimary)">
        <h1 className="[font:var(--title-1-emphasized)]">
          Analytics is for artists and administrators
        </h1>
        <p className="mt-3 text-(--systemSecondary) [font:var(--body)]">
          Your account does not have access to the analytics workspace.
        </p>
      </div>
    );
  }

  return (
    <MusicPageLayout>
      <MusicPageHeading
        title={isAdmin ? "System analytics" : "Artist analytics"}
        trailing={
          <Link
            href={isAdmin ? "/admin" : "/library"}
            className="rounded-full bg-(--keyColor) px-4 py-2 text-(--keyColorText) [font:var(--callout-emphasized)]"
          >
            {isAdmin ? "Open Admin" : "Manage releases"}
          </Link>
        }
      />
      {isAdmin ? <AdminAnalytics /> : <ArtistAnalytics />}
    </MusicPageLayout>
  );
}
