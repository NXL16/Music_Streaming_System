"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import {
  MusicPageHeading,
  MusicPageLayout,
} from "@/components/layout/music-page-layout";
import { listAdminUsers } from "@/lib/auth/auth.api";
import {
  getAdminListeningAnalytics,
  getAdminRecommendationQuality,
} from "@/lib/admin/admin.api";
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

function formatRate(numerator: number, denominator: number) {
  const rate = denominator > 0 ? (numerator / denominator) * 100 : 0;
  return rate < 1 ? `${rate.toFixed(2)}%` : `${rate.toFixed(1)}%`;
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
    const day = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - offset,
      ),
    );
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
      .map((point, index) => `${pointX(index)},${pointY(point[key])}`)
      .join(" ");
  const hoveredIndex = hovered?.index ?? null;
  const hoveredPoint = hoveredIndex === null ? null : timeline[hoveredIndex];

  const updateHoveredIndex = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
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
        <span className="inline-flex items-center gap-2">
          <i className="h-2 w-2 rounded-full bg-(--keyColor)" />
          Plays
        </span>
        <span className="inline-flex items-center gap-2">
          <i className="h-2 w-2 rounded-full bg-(--statusPositive)" />
          Completed
        </span>
        <span className="inline-flex items-center gap-2">
          <i className="h-2 w-2 rounded-full bg-(--systemSecondary)" />
          Skips
        </span>
        <span className="inline-flex items-center gap-2">
          <i className="h-2 w-2 rounded-full bg-[#5ac8fa]" />
          Listeners
        </span>
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
        <polyline
          points={line("completions")}
          fill="none"
          stroke="var(--statusPositive)"
          strokeWidth="1.7"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={line("skips")}
          fill="none"
          stroke="var(--systemSecondary)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={line("listeners")}
          fill="none"
          stroke="#5ac8fa"
          strokeWidth="1.7"
          vectorEffect="non-scaling-stroke"
        />
        {/* SVG transparent areas do not consistently receive mouse events;
            this hit target makes every date column hoverable. */}
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          fill="transparent"
          pointerEvents="all"
        />
      </svg>
      {hoveredPoint && hovered && (
        <div
          style={{ left: hovered.x, top: hovered.y }}
          className="pointer-events-none fixed z-50 w-52 rounded-xl border border-(--labelDivider) bg-(--background) p-3 shadow-2xl"
        >
          <p className="text-(--systemPrimary) [font:var(--footnote-emphasized)]">
            {hoveredPoint.date}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-(--systemSecondary) [font:var(--footnote)]">
            <dt>Plays</dt>
            <dd className="text-right text-(--systemPrimary)">
              {hoveredPoint.plays}
            </dd>
            <dt>Completed</dt>
            <dd className="text-right text-(--systemPrimary)">
              {hoveredPoint.completions}
            </dd>
            <dt>Skips</dt>
            <dd className="text-right text-(--systemPrimary)">
              {hoveredPoint.skips}
            </dd>
            <dt>Listeners</dt>
            <dd className="text-right text-(--systemPrimary)">
              {hoveredPoint.listeners}
            </dd>
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
  const [statusFilter, setStatusFilter] = useState<
    "all" | "live" | "processing" | "attention"
  >("all");
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
    if (statusFilter === "live")
      return safeSongs.filter((song) => song.status === 3);
    if (statusFilter === "processing")
      return safeSongs.filter((song) => song.status === 1 || song.status === 2);
    if (statusFilter === "attention")
      return safeSongs.filter((song) => song.status === 4);
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
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
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
            note={
              hasMore
                ? "Latest loaded releases; open Library for all"
                : "Your uploaded releases"
            }
          />
          <Metric
            label="Live"
            value={loading ? "—" : metrics.ready}
            note={
              hasMore ? "Among latest loaded releases" : "Ready for playback"
            }
          />
          <Metric
            label="Processing"
            value={loading ? "—" : metrics.processing}
            note={
              hasMore
                ? "Among latest loaded releases"
                : "Waiting for media processing"
            }
          />
          <Metric
            label="Needs attention"
            value={loading ? "—" : metrics.failed}
            note={
              hasMore ? "Among latest loaded releases" : "Processing failed"
            }
          />
          <Metric
            label="Public"
            value={loading ? "—" : metrics.public}
            note={
              hasMore ? "Among latest loaded releases" : "Visible to listeners"
            }
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
            <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
              Release queue
            </p>
            <p className="mt-1 text-(--systemSecondary) [font:var(--footnote)]">
              Your most recently loaded releases and their processing state.
            </p>
          </div>
          <Link
            className="inline-flex items-center gap-1 text-(--keyColor) [font:var(--callout-emphasized)]"
            href="/library"
          >
            Manage releases <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
        <div
          className="mt-4 flex gap-2 overflow-x-auto pb-1"
          role="tablist"
          aria-label="Release status"
        >
          {(
            [
              ["all", "All"],
              ["live", "Live"],
              ["processing", "Processing"],
              ["attention", "Needs attention"],
            ] as const
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
            <Link
              key={song.id}
              href={`/song/${encodeURIComponent(song.id)}`}
              className="flex items-center justify-between gap-4 py-3 transition hover:opacity-70"
            >
              <span className="min-w-0">
                <span className="block truncate text-(--systemPrimary) [font:var(--callout-emphasized)]">
                  {song.title || "Untitled track"}
                </span>
                <span className="block truncate text-(--systemSecondary) [font:var(--footnote)]">
                  {song.album || "Single"} ·{" "}
                  {song.isPublic ? "Public" : "Private"}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 [font:var(--footnote-emphasized)] ${song.status === 3 ? "bg-(--statusPositiveBackground) text-(--statusPositive)" : song.status === 4 ? "bg-(--statusNegativeBackground) text-(--keyColor)" : "bg-(--systemQuinary) text-(--systemSecondary)"}`}
              >
                {statusLabel(song.status)}
              </span>
            </Link>
          ))}
          {!loading && visibleSongs.length === 0 && (
            <p className="py-8 text-center text-(--systemSecondary) [font:var(--callout)]">
              No releases in this status.
            </p>
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
  const [recommendationQuality, setRecommendationQuality] = useState<Awaited<
    ReturnType<typeof getAdminRecommendationQuality>
  > | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const [usersResult, analyticsResult, qualityResult] =
      await Promise.allSettled([
        listAdminUsers({ page: 1, limit: 1 }),
        getAdminListeningAnalytics(sinceSaturdayAnalyticsWindowDays()),
        getAdminRecommendationQuality(28, 100),
      ]);
    if (usersResult.status === "fulfilled") {
      setTotalUsers(usersResult.value.data.total);
    }
    if (analyticsResult.status === "fulfilled") {
      setAnalytics(analyticsResult.value);
      setUpdatedAt(new Date());
    }
    if (qualityResult.status === "fulfilled") {
      setRecommendationQuality(qualityResult.value);
    }
    if (
      usersResult.status === "rejected" ||
      analyticsResult.status === "rejected" ||
      qualityResult.status === "rejected"
    ) {
      setError(
        "Some analytics could not be loaded. Check your admin permission or try again.",
      );
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
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-(--systemQuinary) px-3 py-2 text-(--systemPrimary) [font:var(--footnote-emphasized)] transition hover:opacity-75 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>
      <div className="mb-5 border-y border-(--labelDivider) py-3 text-(--systemSecondary) [font:var(--footnote)]">
        {updatedAt
          ? `Since Saturday · Updated ${updatedAt.toLocaleTimeString()}`
          : "Loading activity since Saturday…"}
      </div>
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-xl bg-(--statusNegativeBackground) px-4 py-3 text-(--keyColor)"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 [font:var(--callout)]">{error}</div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="[font:var(--callout-emphasized)] underline"
          >
            Retry
          </button>
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
        <Metric
          label="Recommendation play rate"
          value={
            recommendationQuality
              ? formatRate(
                  recommendationQuality.summary.plays,
                  recommendationQuality.summary.impressions,
                )
              : "—"
          }
          note="Recommendation plays per impression"
        />
      </div>
      {recommendationQuality && (
        <RecommendationQualityDashboard quality={recommendationQuality} />
      )}
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
                <span className="text-(--systemSecondary) [font:var(--callout-emphasized)]">
                  {index + 1}
                </span>
                <span className="min-w-0 truncate">
                  <span className="block truncate">
                    {song.title || song.songId}
                  </span>
                  <span className="text-(--systemSecondary)">
                    {song.artistName}
                  </span>
                </span>
                <span className="shrink-0 text-right text-(--systemSecondary) [font:var(--footnote)]">
                  {song.plays} plays · {song.listeners} listeners
                  <br />
                  {percentage(song.completions, song.plays)}% complete ·{" "}
                  {percentage(song.skips, song.plays)}% skipped
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

type RecommendationQuality = Awaited<
  ReturnType<typeof getAdminRecommendationQuality>
>;

const MINIMUM_RANKING_IMPRESSIONS = 200;

type RecommendationScope = "all" | "personal" | "global";

function recommendationScope(
  sectionId: string,
): Exclude<RecommendationScope, "all"> {
  return sectionId.startsWith("global-") ? "global" : "personal";
}

function RecommendationQualityDashboard({
  quality,
}: {
  quality: RecommendationQuality;
}) {
  const { summary } = quality;
  const [scope, setScope] = useState<RecommendationScope>("all");
  const [modelVersion, setModelVersion] = useState(() =>
    String(quality.activeModelVersion),
  );
  const [onlyEngaged, setOnlyEngaged] = useState(false);
  const [visibleRowCount, setVisibleRowCount] = useState(25);
  const sections = [...quality.sections].sort(
    (left, right) => right.impressions - left.impressions,
  );
  const modelVersions = Array.from(
    new Set(sections.map((section) => section.modelVersion)),
  ).sort((left, right) => right - left);
  const filteredSections = sections.filter((section) => {
    const matchesScope =
      scope === "all" || recommendationScope(section.sectionId) === scope;
    const matchesModel =
      modelVersion === "all" || section.modelVersion === Number(modelVersion);
    const hasEngagement =
      !onlyEngaged ||
      section.opens > 0 ||
      section.plays > 0 ||
      section.dismisses > 0;
    return matchesScope && matchesModel && hasEngagement;
  });
  const bestPlaySections = [...filteredSections]
    .filter((section) => section.impressions >= MINIMUM_RANKING_IMPRESSIONS)
    .sort(
      (left, right) =>
        right.playRate - left.playRate || right.impressions - left.impressions,
    )
    .slice(0, 8);
  const maxPlayRate = Math.max(
    0.01,
    ...bestPlaySections.map((section) => section.playRate),
  );

  return (
    <section className="mt-8 border-t border-(--labelDivider) pt-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-(--systemPrimary) [font:var(--title-3-emphasized)]">
            Recommendation quality
          </h2>
          <p className="mt-1 text-(--systemSecondary) [font:var(--footnote)]">
            {quality.baselineApplied
              ? `Baseline since ${new Date(quality.windowStartAt).toLocaleString()}`
              : "Last 28 days"}{" "}
            · Recently Played excluded · interaction rates are per card
            impression
          </p>
        </div>
        <p className="text-(--systemSecondary) [font:var(--footnote)]">
          v{quality.activeModelVersion} is active · {filteredSections.length} of{" "}
          {sections.length} shelves · {summary.users} listeners
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QualityKpi
          label="Cards seen"
          value={summary.impressions}
          note="Total ranked shelf impressions"
        />
        <QualityKpi
          label="Opened"
          value={summary.opens}
          note={formatRate(summary.opens, summary.impressions)}
        />
        <QualityKpi
          label="Played"
          value={summary.plays}
          note={formatRate(summary.plays, summary.impressions)}
        />
        <QualityKpi
          label="Dismissed"
          value={summary.dismisses}
          note={formatRate(summary.dismisses, summary.impressions)}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-y border-(--labelDivider) py-3">
        <span className="me-1 text-(--systemSecondary) [font:var(--footnote-emphasized)]">
          View
        </span>
        {(
          [
            ["all", "All shelves"],
            ["personal", "Personal"],
            ["global", "Global"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            onClick={() => {
              setScope(value);
              setVisibleRowCount(25);
            }}
            className={`rounded-full px-3 py-1.5 [font:var(--footnote-emphasized)] transition ${scope === value ? "bg-(--systemPrimary) text-(--background)" : "bg-(--systemQuinary) text-(--systemSecondary) hover:text-(--systemPrimary)"}`}
          >
            {label}
          </button>
        ))}
        <label className="ms-auto flex items-center gap-2 text-(--systemSecondary) [font:var(--footnote)]">
          Model
          <select
            value={modelVersion}
            onChange={(event) => {
              setModelVersion(event.target.value);
              setVisibleRowCount(25);
            }}
            className="rounded-lg border border-(--labelDivider) bg-(--background) px-2 py-1 text-(--systemPrimary)"
          >
            <option value="all">All versions</option>
            {modelVersions.map((version) => (
              <option key={version} value={version}>
                v{version}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-(--systemSecondary) [font:var(--footnote)]">
          <input
            type="checkbox"
            checked={onlyEngaged}
            onChange={(event) => {
              setOnlyEngaged(event.target.checked);
              setVisibleRowCount(25);
            }}
            className="accent-(--keyColor)"
          />
          Only interactions
        </label>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-2xl border border-(--labelDivider) bg-(--systemQuinary) p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
                Engagement rate
              </h3>
              <p className="mt-1 text-(--systemSecondary) [font:var(--footnote)]">
                A direct view of how useful the served cards are.
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <QualityRing
              label="Open"
              value={summary.opens}
              total={summary.impressions}
              color="var(--keyColor)"
            />
            <QualityRing
              label="Play"
              value={summary.plays}
              total={summary.impressions}
              color="var(--statusPositive)"
            />
            <QualityRing
              label="Dismiss"
              value={summary.dismisses}
              total={summary.impressions}
              color="var(--systemRed)"
            />
          </div>
          <div className="mt-6 border-t border-(--labelDivider) pt-4">
            <p className="text-(--systemSecondary) [font:var(--footnote-emphasized)]">
              Conversion path
            </p>
            <div className="mt-3 space-y-3">
              <FunnelStage
                label="Seen"
                value={summary.impressions}
                total={summary.impressions}
                color="var(--systemPrimary)"
              />
              <FunnelStage
                label="Opened"
                value={summary.opens}
                total={summary.impressions}
                color="var(--keyColor)"
              />
              <FunnelStage
                label="Played"
                value={summary.plays}
                total={summary.impressions}
                color="var(--statusPositive)"
              />
              <FunnelStage
                label="Dismissed"
                value={summary.dismisses}
                total={summary.impressions}
                color="var(--systemRed)"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-(--labelDivider) p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
                Best play rate by shelf
              </h3>
              <p className="mt-1 text-(--systemSecondary) [font:var(--footnote)]">
                Only shelves with at least {MINIMUM_RANKING_IMPRESSIONS}{" "}
                impressions are ranked.
              </p>
            </div>
            <span className="text-(--systemSecondary) [font:var(--footnote)]">
              Top {bestPlaySections.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {bestPlaySections.map((section) => (
              <div key={`${section.sectionId}:${section.modelVersion}`}>
                <div className="flex items-center justify-between gap-3 [font:var(--footnote)]">
                  <span className="min-w-0 truncate text-(--systemPrimary)">
                    {section.sectionId}
                  </span>
                  <span className="shrink-0 text-(--systemSecondary)">
                    {formatRate(section.plays, section.impressions)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-(--systemQuinary)">
                  <div
                    className="h-full rounded-full bg-(--statusPositive)"
                    style={{
                      width: `${Math.max(4, (section.playRate / maxPlayRate) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-(--systemSecondary) [font:var(--footnote)]">
                  Model {section.modelVersion} · {section.plays} plays from{" "}
                  {section.impressions} impressions
                </p>
              </div>
            ))}
            {bestPlaySections.length === 0 && (
              <p className="py-8 text-center text-(--systemSecondary) [font:var(--callout)]">
                No shelf meets the {MINIMUM_RANKING_IMPRESSIONS}-impression
                threshold for this view.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-(--labelDivider)">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-(--labelDivider) px-4 py-4 sm:px-5">
          <div>
            <h3 className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
              Shelf performance table
            </h3>
            <p className="mt-1 text-(--systemSecondary) [font:var(--footnote)]">
              Compare shelf/model performance. Rows under{" "}
              {MINIMUM_RANKING_IMPRESSIONS} impressions are marked as low
              sample.
            </p>
          </div>
          <span className="text-(--systemSecondary) [font:var(--footnote)]">
            Showing {Math.min(visibleRowCount, filteredSections.length)} of{" "}
            {filteredSections.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-190 text-left">
            <thead className="bg-(--systemQuinary) text-(--systemSecondary) [font:var(--footnote-emphasized)]">
              <tr>
                <th className="px-4 py-3 sm:px-5">Shelf</th>
                <th className="px-3 py-3">Model</th>
                <th className="px-3 py-3 text-right">Audience</th>
                <th className="px-3 py-3 text-right">Impressions</th>
                <th className="px-3 py-3 text-right">Open rate</th>
                <th className="px-3 py-3 text-right">Play rate</th>
                <th className="px-4 py-3 text-right sm:px-5">Dismiss rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--labelDivider) text-(--systemPrimary) [font:var(--callout)]">
              {filteredSections.slice(0, visibleRowCount).map((section) => (
                <tr
                  key={`${section.sectionId}:${section.modelVersion}`}
                  className="transition hover:bg-(--systemQuinary)"
                >
                  <td className="max-w-72 px-4 py-3 sm:px-5">
                    <span className="block truncate [font:var(--callout-emphasized)]">
                      {section.sectionId}
                    </span>
                    {section.impressions < MINIMUM_RANKING_IMPRESSIONS && (
                      <span className="mt-0.5 block text-(--systemSecondary) [font:var(--footnote)]">
                        Low sample
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-(--systemSecondary)">
                    v{section.modelVersion}
                  </td>
                  <td className="px-3 py-3 text-right">{section.users}</td>
                  <td className="px-3 py-3 text-right">
                    {section.impressions}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {formatRate(section.opens, section.impressions)}
                  </td>
                  <td className="px-3 py-3 text-right text-(--statusPositive)">
                    {formatRate(section.plays, section.impressions)}
                  </td>
                  <td className="px-4 py-3 text-right text-(--systemSecondary) sm:px-5">
                    {formatRate(section.dismisses, section.impressions)}
                  </td>
                </tr>
              ))}
              {filteredSections.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-(--systemSecondary) sm:px-5"
                  >
                    No shelves match this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredSections.length > visibleRowCount && (
          <div className="border-t border-(--labelDivider) px-4 py-3 text-center sm:px-5">
            <button
              type="button"
              onClick={() =>
                setVisibleRowCount((count) =>
                  Math.min(count + 25, filteredSections.length),
                )
              }
              className="text-(--keyColor) [font:var(--callout-emphasized)]"
            >
              Show 25 more
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function QualityKpi({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-(--labelDivider) px-4 py-3 text-(--systemPrimary)">
      <p className="text-(--systemSecondary) [font:var(--footnote-emphasized)]">
        {label}
      </p>
      <p className="mt-1 [font:var(--title-2-emphasized)]">{value}</p>
      <p className="mt-1 text-(--systemSecondary) [font:var(--footnote)]">
        {note}
      </p>
    </div>
  );
}

function QualityRing({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const rate = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="text-center">
      <div
        className="mx-auto grid h-20 w-20 place-items-center rounded-full p-2"
        style={{
          background: `conic-gradient(${color} ${rate}%, var(--systemQuinary) 0)`,
        }}
        role="img"
        aria-label={`${label} rate ${formatRate(value, total)}`}
      >
        <div className="grid h-full w-full place-items-center rounded-full bg-(--background) px-1 text-(--systemPrimary) [font:var(--footnote-emphasized)]">
          {formatRate(value, total)}
        </div>
      </div>
      <p className="mt-2 text-(--systemPrimary) [font:var(--footnote-emphasized)]">
        {label}
      </p>
      <p className="mt-0.5 text-(--systemSecondary) [font:var(--footnote)]">
        {value} events
      </p>
    </div>
  );
}

function FunnelStage({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const width = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)_auto] items-center gap-3">
      <span className="text-(--systemSecondary) [font:var(--footnote)]">
        {label}
      </span>
      <div className="h-2 overflow-hidden rounded-full bg-(--background)">
        <div
          className="h-full rounded-full"
          style={{
            background: color,
            width: value > 0 ? `${Math.max(2, width)}%` : "0%",
          }}
        />
      </div>
      <span className="text-right text-(--systemPrimary) [font:var(--footnote-emphasized)]">
        {value}{" "}
        <span className="text-(--systemSecondary)">
          ({formatRate(value, total)})
        </span>
      </span>
    </div>
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
