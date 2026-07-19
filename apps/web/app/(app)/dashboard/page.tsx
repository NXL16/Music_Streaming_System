"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  if (!points.length)
    return (
      <div className="border-t border-(--labelDivider) py-10 text-center text-(--systemSecondary) [font:var(--callout)]">
        No listening activity in this period.
      </div>
    );
  const max = Math.max(
    1,
    ...points.flatMap((point) => [point.plays, point.completions, point.skips]),
  );
  const line = (key: "plays" | "completions" | "skips") =>
    points
      .map(
        (point, index) =>
          `${points.length === 1 ? 50 : (index / (points.length - 1)) * 100},${92 - (point[key] / max) * 78}`,
      )
      .join(" ");
  return (
    <div className="border-t border-(--labelDivider) pt-5">
      <div className="flex items-baseline justify-between">
        <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
          Listening trend
        </p>
        <span className="text-(--systemSecondary) [font:var(--footnote)]">
          Last 28 days
        </span>
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="mt-4 h-52 w-full overflow-visible"
        role="img"
        aria-label="Listening trend chart"
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
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={line("skips")}
          fill="none"
          stroke="var(--systemSecondary)"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-2 flex gap-4 text-(--systemSecondary) [font:var(--footnote)]">
        <span>● Plays</span>
        <span>● Completed</span>
        <span>● Skips</span>
      </div>
      <div className="mt-2 flex justify-between text-(--systemSecondary) [font:var(--footnote)]">
        <span>{points[0]?.date}</span>
        <span>{points.at(-1)?.date}</span>
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
  const { songs, loading, error } = useSongLibrary();
  const metrics = useMemo(() => {
    const safeSongs = songs ?? [];
    return {
      total: safeSongs.length,
      ready: safeSongs.filter((song) => song.status === 3).length,
      processing: safeSongs.filter(
        (song) => song.status === 1 || song.status === 2,
      ).length,
      failed: safeSongs.filter((song) => song.status === 4).length,
    };
  }, [songs]);

  return (
    <section className="box-border p-[0_var(--shelfGridPaddingInline,var(--bodyGutter))] relative w-full z-(--z-default)">
      <div className="items-center flex justify-end m-[0_0_13px]">
        <div className="flex-1">
          <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
            Release health
          </h2>
        </div>
      </div>
      {error ? (
        <p className="text-(--keyColor) [font:var(--callout)]">
          Could not load your catalog analytics.
        </p>
      ) : (
        <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Tracks"
            value={loading ? "—" : metrics.total}
            note="Your uploaded releases"
          />
          <Metric
            label="Live"
            value={loading ? "—" : metrics.ready}
            note="Ready for playback"
          />
          <Metric
            label="Processing"
            value={loading ? "—" : metrics.processing}
            note="Waiting for media processing"
          />
          <Metric
            label="Needs attention"
            value={loading ? "—" : metrics.failed}
            note="Processing failed"
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
        <Link
          className="text-(--keyColor) [font:var(--callout-emphasized)]"
          href="/library"
        >
          Manage your releases
        </Link>
      </div>
    </section>
  );
}

function AdminAnalytics() {
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<Awaited<
    ReturnType<typeof getAdminListeningAnalytics>
  > | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    listAdminUsers({ page: 1, limit: 1 })
      .then((response) => setTotalUsers(response.data.total))
      .catch(() => setError(true));
  }, []);
  useEffect(() => {
    getAdminListeningAnalytics()
      .then(setAnalytics)
      .catch(() => setError(true));
  }, []);

  return (
    <section className="box-border p-[0_var(--shelfGridPaddingInline,var(--bodyGutter))] relative w-full z-(--z-default)">
      <div className="items-center flex justify-end m-[0_0_13px]">
        <div className="flex-1">
          <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
            System overview
          </h2>
        </div>
      </div>
      <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Users"
          value={error ? "Restricted" : (totalUsers ?? "—")}
          note="Accounts in Identity"
        />
        <Metric
          label="Plays (28d)"
          value={analytics?.plays ?? "—"}
          note="Recorded play starts"
        />
        <Metric
          label="Listeners (28d)"
          value={analytics?.listeners ?? "—"}
          note="Unique listeners"
        />
        <Metric
          label="Completion rate"
          value={
            analytics
              ? `${analytics.plays ? Math.round((analytics.completions / analytics.plays) * 100) : 0}%`
              : "—"
          }
          note="Completed listening events"
        />
        <Metric
          label="Skip rate"
          value={
            analytics
              ? `${analytics.plays ? Math.round((analytics.skips / analytics.plays) * 100) : 0}%`
              : "—"
          }
          note="Skipped listening events"
        />
      </div>
      {analytics && <TrendChart points={analytics.trend} />}
      {analytics?.topSongs.length ? (
        <div className="mt-6 border-t border-(--labelDivider) pt-5">
          <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
            Top songs
          </p>
          <div className="mt-3 grid gap-2">
            {analytics.topSongs.slice(0, 5).map((song) => (
              <div
                key={song.songId}
                className="flex items-center justify-between gap-4 text-(--systemPrimary) [font:var(--callout)]"
              >
                <span className="truncate">
                  {song.title || song.songId}{" "}
                  <span className="text-(--systemSecondary)">
                    {song.artistName}
                  </span>
                </span>
                <span className="shrink-0 text-(--systemSecondary)">
                  {song.plays} plays · {song.listeners} listeners ·{" "}
                  {song.completions} complete · {song.skips} skips
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
