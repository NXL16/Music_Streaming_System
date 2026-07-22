"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";
import { Music2 } from "lucide-react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useRouter } from "next/navigation";
import {
  getHomeRecommendations,
  handoffHomeRecommendations,
} from "@/lib/recommendations/recommendation.api";
import type { RecommendationResponse } from "@/lib/recommendations/recommendation.types";

const EXIT_DURATION_MS = 500;
const MIN_SPLASH_MS = 3000;
const smoothEase = [0.16, 1, 0.3, 1] as const;
const gentleEase = [0.25, 0.46, 0.45, 0.94] as const;

const D = {
  wordmark: 0.0,
  ring: 0.18,
  orbital: 0.45,
  title: 0.55,
  stats: 0.72,
  waveform: 0.88,
  progress: 1.05,
} as const;

const CEILING = {
  init: 12, // vừa mount, đang chờ Auth Store xác thực
  fetchingHome: 88, // authenticated: đang tải data trang home
  ready: 100, // guest, hoặc data home đã tải xong toàn bộ
} as const;

const WAVE_BARS = [
  { height: 18, duration: 1.0, delay: 0.0 },
  { height: 32, duration: 1.1, delay: 0.06 },
  { height: 23, duration: 0.9, delay: 0.13 },
  { height: 38, duration: 1.2, delay: 0.04 },
  { height: 22, duration: 1.0, delay: 0.19 },
  { height: 34, duration: 1.3, delay: 0.08 },
  { height: 26, duration: 1.1, delay: 0.24 },
  { height: 40, duration: 0.95, delay: 0.11 },
  { height: 20, duration: 1.15, delay: 0.3 },
  { height: 36, duration: 1.05, delay: 0.02 },
  { height: 28, duration: 1.2, delay: 0.17 },
  { height: 40, duration: 0.9, delay: 0.09 },
  { height: 24, duration: 1.1, delay: 0.22 },
  { height: 32, duration: 1.0, delay: 0.15 },
  { height: 18, duration: 1.3, delay: 0.27 },
  { height: 36, duration: 1.05, delay: 0.05 },
  { height: 22, duration: 1.1, delay: 0.2 },
  { height: 30, duration: 0.95, delay: 0.12 },
  { height: 38, duration: 1.15, delay: 0.07 },
  { height: 26, duration: 1.0, delay: 0.25 },
] as const;

const CIRCLE_RADIUS = 72;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

interface FadeSlideProps {
  delay: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  yOffset?: number;
}

function FadeSlide({ delay, children, style, yOffset = 20 }: FadeSlideProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : yOffset }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.65,
        ease: smoothEase,
        delay: reduceMotion ? 0 : delay,
      }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

interface OrbitalDotProps {
  duration: number;
  delay: number;
  radius: number;
  size: number;
  opacity: number;
  reverse?: boolean;
}

function OrbitalDot({
  duration,
  delay,
  radius,
  size,
  opacity,
  reverse = false,
}: OrbitalDotProps) {
  return (
    <motion.div
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        top: "50%",
        left: "50%",
      }}
      animate={{ rotate: reverse ? [360, 0] : [0, 360] }}
      transition={{ duration, delay, repeat: Infinity, ease: "linear" }}
    >
      <div
        style={{
          position: "absolute",
          top: -radius - size / 2,
          left: -size / 2,
          width: size,
          height: size,
          borderRadius: "50%",
          background: `rgba(255,255,255,${opacity})`,
        }}
      />
    </motion.div>
  );
}

function countResources(bucket: Record<string, unknown> | undefined): number {
  return bucket ? Object.keys(bucket).length : 0;
}

function formatSyncTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function SplashScreen() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hintIdx, setHintIdx] = useState(0);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);

  const [homeData, setHomeData] = useState<RecommendationResponse | null>(null);
  const [homeReady, setHomeReady] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);

  const progressRef = useRef(0);
  const leaveScheduledRef = useRef(false);

  const displayName = user?.displayName?.split(" ")[0] ?? null;

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    getHomeRecommendations()
      .then((data) => {
        if (cancelled) return;
        setHomeData(data);
        handoffHomeRecommendations(data);
        setSyncedAt(new Date());
      })
      .catch(() => {
        if (cancelled) return;
        setSyncedAt(new Date());
      })
      .finally(() => {
        if (cancelled) return;
        setHomeReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    const t = setTimeout(() => setMinSplashElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status === "checking") return;
    router.prefetch(status === "authenticated" ? "/home" : "/login");
  }, [status, router]);

  const ceiling = useMemo(() => {
    if (status === "checking") return CEILING.init;
    if (status === "guest") return CEILING.ready;
    return homeReady ? CEILING.ready : CEILING.fetchingHome;
  }, [status, homeReady]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const current = progressRef.current;
      if (current >= ceiling) return;

      const remaining = ceiling - current;
      const step = reduceMotion ? remaining : Math.max(0.5, remaining * 0.09);
      const next = Math.min(ceiling, current + step);
      progressRef.current = next;
      setProgress(next);

      if (next < ceiling) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ceiling, reduceMotion]);

  useEffect(() => {
    if (
      progress < 100 ||
      status === "checking" ||
      !minSplashElapsed ||
      leaveScheduledRef.current
    ) {
      return;
    }
    leaveScheduledRef.current = true;
    setLeaving(true);
  }, [progress, status, minSplashElapsed]);

  useEffect(() => {
    if (!leaving) return;

    const navTimer = setTimeout(
      () => {
        router.replace(
          useAuthStore.getState().status === "authenticated"
            ? "/home"
            : "/login",
        );
      },
      reduceMotion ? 80 : EXIT_DURATION_MS,
    );

    return () => clearTimeout(navTimer);
  }, [leaving, router, reduceMotion]);

  const stepLabel = useMemo(() => {
    if (status === "checking") return "Checking your session";
    if (status === "guest") return "Redirecting to sign in";
    if (!homeReady) return "Loading your music";
    return "Ready";
  }, [status, homeReady]);

  const stageDots = useMemo(
    () => [
      { label: "Session", active: status !== "checking" },
      { label: "Library", active: homeReady || status === "guest" },
      { label: "Ready", active: progress >= 99 },
    ],
    [status, homeReady, progress],
  );

  const stats = useMemo(() => {
    if (!homeData?.resources) return null;

    const songs = countResources(homeData.resources.songs);
    const playlists = countResources(homeData.resources.playlists);
    const albums = countResources(homeData.resources.albums);

    const parts: string[] = [];
    if (songs > 0) parts.push(`${songs} songs`);
    if (playlists > 0) parts.push(`${playlists} playlists`);
    else if (albums > 0) parts.push(`${albums} albums`);
    if (syncedAt) parts.push(`Last sync: ${formatSyncTime(syncedAt)}`);

    return parts.length ? parts : null;
  }, [homeData, syncedAt]);

  const hints = useMemo(() => {
    const sections = homeData?.resources?.personalRecommendation;
    if (sections) {
      const titles = Object.values(sections)
        .map((section) => section.attributes?.title?.stringForDisplay)
        .filter((title): title is string => Boolean(title));
      const unique = [...new Set(titles)].slice(0, 5);
      if (unique.length) return unique;
    }

    if (status === "guest") return ["Preparing your sign in"];
    return ["Personalizing your home", "Loading your recommendations"];
  }, [homeData, status]);

  const currentHint = hints[hintIdx % hints.length];

  useEffect(() => {
    if (hints.length <= 1) return;
    const t = setInterval(() => setHintIdx((i) => i + 1), 2000);
    return () => clearInterval(t);
  }, [hints.length]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#1f1f1f",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(40px, 6vh, 80px) clamp(24px, 6vw, 80px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 55% 40% at 50% 0%, rgba(255,255,255,0.03) 0%, transparent 65%)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      ></div>
      <AnimatePresence>
        {!leaving && (
          <motion.div
            key="splash-content"
            exit={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
            transition={{ duration: 0.5, ease: gentleEase }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
              maxWidth: 480,
              gap: "clamp(28px, 4vh, 44px)",
            }}
          >
            {/* ── Centre Block (Logo & Brand) ── */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "100%",
              }}
            >
              {/* Wordmark */}
              <FadeSlide
                delay={D.wordmark}
                style={{ marginBottom: "clamp(24px, 3.5vh, 36px)" }}
              >
                <p
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.18em",
                    color: "rgba(255,255,255,0.2)",
                    margin: 0,
                    textTransform: "uppercase",
                    fontWeight: 500,
                  }}
                >
                  404hz
                </p>
              </FadeSlide>

              {/* Ring / Orbital Dots / Logo Box */}
              <motion.div
                initial={{ opacity: 0, scale: 0.82 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.7,
                  ease: smoothEase,
                  delay: reduceMotion ? 0 : D.ring,
                }}
                style={{
                  position: "relative",
                  width: 160,
                  height: 160,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "clamp(28px, 4vh, 40px)",
                }}
              >
                {/* Static Track */}
                <svg
                  width={160}
                  height={160}
                  style={{ position: "absolute", top: 0, left: 0 }}
                  aria-hidden
                >
                  <circle
                    cx={80}
                    cy={80}
                    r={CIRCLE_RADIUS}
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth={1}
                  />
                </svg>

                {/* Progress Arc — phản ánh đúng tiến trình tải thật */}
                {!reduceMotion && (
                  <svg
                    width={160}
                    height={160}
                    style={{ position: "absolute", top: 0, left: 0 }}
                    aria-hidden
                  >
                    <motion.circle
                      cx={80}
                      cy={80}
                      r={CIRCLE_RADIUS}
                      fill="none"
                      stroke="rgba(255,255,255,0.18)"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeDasharray={CIRCLE_CIRCUMFERENCE}
                      initial={{ strokeDashoffset: CIRCLE_CIRCUMFERENCE }}
                      animate={{
                        strokeDashoffset:
                          CIRCLE_CIRCUMFERENCE * (1 - progress / 100),
                      }}
                      transition={{ duration: 0.3, ease: "linear" }}
                      style={{
                        transformOrigin: "80px 80px",
                        transform: "rotate(-90deg)",
                      }}
                    />
                  </svg>
                )}

                {/* Orbital Dots */}
                {!reduceMotion && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: D.orbital }}
                    style={{ position: "absolute", inset: 0 }}
                  >
                    <OrbitalDot
                      duration={3.2}
                      delay={0}
                      radius={CIRCLE_RADIUS}
                      size={7}
                      opacity={0.6}
                    />
                    <OrbitalDot
                      duration={5.0}
                      delay={0}
                      radius={CIRCLE_RADIUS}
                      size={4}
                      opacity={0.22}
                      reverse
                    />
                  </motion.div>
                )}

                {/* Central Logo Box */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.75 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: 0.55,
                    ease: smoothEase,
                    delay: reduceMotion ? 0 : D.ring + 0.08,
                  }}
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 24,
                    background: "#141414",
                    border: "0.5px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <Music2 size={40} color="rgba(255,255,255,0.82)" />
                </motion.div>
              </motion.div>

              {/* Welcome Titles */}
              <FadeSlide
                delay={D.title}
                style={{ textAlign: "center", marginBottom: 10 }}
              >
                <h1
                  style={{
                    fontSize: "clamp(28px, 3.5vw, 42px)",
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.92)",
                    margin: "0 0 6px",
                    letterSpacing: "-0.025em",
                  }}
                >
                  {displayName
                    ? `Welcome back, ${displayName}`
                    : "Welcome back"}
                </h1>
                <p
                  style={{
                    fontSize: "clamp(14.4px, 1.6vw, 17.2px)",
                    color: "rgba(255,255,255,0.26)",
                    margin: 0,
                    fontWeight: 400,
                  }}
                >
                  Getting everything ready
                </p>
              </FadeSlide>

              {/* Statistical Metadata Line — data thật từ trang home */}
              <FadeSlide
                delay={D.stats}
                style={{ marginBottom: "clamp(24px, 3.5vh, 36px)" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 18,
                  }}
                >
                  {stats ? (
                    stats.map((text, i) => (
                      <span
                        key={text}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        {i > 0 && (
                          <span
                            style={{
                              width: 2,
                              height: 2,
                              borderRadius: "50%",
                              background: "rgba(255,255,255,0.12)",
                              display: "inline-block",
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span
                          style={{
                            fontSize: 14,
                            color: "rgba(255,255,255,0.18)",
                          }}
                        >
                          {text}
                        </span>
                      </span>
                    ))
                  ) : (
                    <span
                      style={{
                        fontSize: 14,
                        color: "rgba(255,255,255,0.14)",
                      }}
                    >
                      {status === "guest"
                        ? "Preparing your experience"
                        : "Syncing your library"}
                    </span>
                  )}
                </div>
              </FadeSlide>

              {/* Active Audio Waveform */}
              <FadeSlide delay={D.waveform}>
                <div
                  aria-hidden
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    height: 52,
                  }}
                >
                  {WAVE_BARS.map((bar, i) => (
                    <motion.span
                      key={i}
                      style={{
                        width: 2.4,
                        height: bar.height,
                        background: "rgba(255,255,255,0.35)",
                        borderRadius: 2,
                        display: "block",
                        transformOrigin: "center",
                      }}
                      animate={
                        reduceMotion
                          ? { scaleY: 0.6, opacity: 0.35 }
                          : {
                              scaleY: [0.2, 1, 0.2],
                              opacity: [0.25, 0.75, 0.25],
                            }
                      }
                      transition={{
                        duration: bar.duration,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: bar.delay,
                      }}
                    />
                  ))}
                </div>
              </FadeSlide>
            </div>

            {/* ── Progress Indicators Block ── */}
            <FadeSlide delay={D.progress} style={{ width: "100%" }}>
              {/* Rotating Dynamic Tip — tên section đề xuất thật */}
              <div
                style={{
                  textAlign: "center",
                  marginBottom: 20,
                  height: 18,
                  overflow: "hidden",
                }}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={currentHint}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.16)",
                      display: "block",
                    }}
                  >
                    {currentHint}
                  </motion.span>
                </AnimatePresence>
              </div>

              {/* Label & Tabular Percentage */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.22)",
                    minWidth: 140,
                    textAlign: "left",
                  }}
                >
                  {stepLabel}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.22)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Math.round(progress)}%
                </span>
              </div>

              {/* Progress Bar Track */}
              <div
                style={{
                  width: "100%",
                  height: 4,
                  background: "rgba(255,255,255,0.1)",
                  borderRadius: 2,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <motion.div
                  style={{
                    height: "100%",
                    background: "rgba(255,255,255,0.6)",
                    borderRadius: 2,
                    position: "relative",
                    overflow: "hidden",
                  }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.05, ease: "linear" }}
                >
                  {/* Shimmer Light Flare Effect */}
                  {!reduceMotion && (
                    <motion.div
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        width: 220,
                        background:
                          "linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)",
                      }}
                      animate={{ x: ["-100%", "500%"] }}
                      transition={{
                        duration: 1.6,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 1,
                      }}
                    />
                  )}
                </motion.div>
              </div>

              {/* Step Sub-dots Status */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 28,
                  marginTop: 18,
                }}
              >
                {stageDots.map(({ label, active }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <motion.span
                      animate={
                        active && !reduceMotion
                          ? {
                              scale: [0.85, 1, 0.85],
                              opacity: [0.3, 0.85, 0.3],
                            }
                          : { opacity: active ? 0.3 : 0.08 }
                      }
                      transition={{
                        duration: 1.8,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.35)",
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        color: active
                          ? "rgba(255,255,255,0.2)"
                          : "rgba(255,255,255,0.08)",
                      }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </FadeSlide>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
