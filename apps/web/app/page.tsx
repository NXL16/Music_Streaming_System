"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";
import { Music2 } from "lucide-react";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useRouter } from "next/navigation";

const EXIT_DURATION_MS = 500;
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

const LOAD_STEPS = [
  { target: 32, label: "Syncing library", dots: [true, false, false] },
  { target: 58, label: "Loading playlists", dots: [true, true, false] },
  { target: 78, label: "Fetching history", dots: [true, true, true] },
  { target: 100, label: "Almost there", dots: [true, true, true] },
] as const;

const DEFAULT_STEP = {
  target: 100,
  label: "Processing",
  dots: [true, true, true],
};

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

const HINTS = [
  "Tip: long press a song to add to queue",
  "Your most played: Blinding Lights",
  "Tip: swipe left to remove from playlist",
  "47 new releases since your last visit",
] as const;

const CIRCLE_RADIUS = 72;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;
const STROKE_OFFSET_TARGET = CIRCLE_CIRCUMFERENCE * (1 - 0.85);

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

export default function SplashScreen() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [hintIdx, setHintIdx] = useState(0);

  const progressRef = useRef(0);
  const stepIdxRef = useRef(0);
  const loopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayName = user?.displayName?.split(" ")[0] ?? null;
  const currentStep = LOAD_STEPS[stepIdx] ?? DEFAULT_STEP;

  // Luồng logic quản lý Tiến trình & Chuyển trang
  useEffect(() => {
    const startTimeoutId = setTimeout(() => {
      const loop = () => {
        // 1. Giữ chân tại 90% nếu hệ thống chưa xác thực xong Auth Store
        if (status === "checking" && progressRef.current >= 90) {
          loopTimeoutRef.current = setTimeout(loop, 100);
          return;
        }

        let nextStepProgress = 1;
        let delay = reduceMotion
          ? 0
          : Math.floor(Math.random() * (16 - 6 + 1)) + 6;

        // 2. Điểm gờ khựng thông minh tại mốc 90%
        if (progressRef.current === 89) {
          delay = reduceMotion
            ? 0
            : Math.floor(Math.random() * (2500 - 1500 + 1)) + 1500;
          nextStepProgress = 0;
          progressRef.current = 90;
        }
        // 3. Pha bứt tốc mượt mà từ 90% -> 100%
        else if (progressRef.current > 90) {
          nextStepProgress = Math.floor(Math.random() * (3 - 2 + 1)) + 2;
          delay = reduceMotion ? 0 : 12;
        }

        // 4. Tiến hành tính toán cấu trúc phần trăm và đồng bộ trạng thái
        if (progressRef.current <= 100) {
          const targetProgress = Math.min(
            100,
            progressRef.current + nextStepProgress,
          );

          if (
            targetProgress !== progressRef.current ||
            nextStepProgress === 0
          ) {
            progressRef.current = targetProgress;
            setProgress(progressRef.current);

            //CHUYỂN TRANG SỚM
            if (targetProgress >= 99 && status !== "checking") {
              setLeaving(true);

              setTimeout(
                () => {
                  router.replace(
                    status === "authenticated" ? "/home" : "/login",
                  );
                },
                reduceMotion ? 80 : EXIT_DURATION_MS,
              );
            }
          }

          // Kiểm tra để cập nhật nhãn hiển thị (Step Label)
          let matchedIdx = LOAD_STEPS.length - 1;
          for (let i = 0; i < LOAD_STEPS.length; i++) {
            if (progressRef.current <= LOAD_STEPS[i].target) {
              matchedIdx = i;
              break;
            }
          }

          if (matchedIdx !== stepIdxRef.current) {
            stepIdxRef.current = matchedIdx;
            setStepIdx(matchedIdx);
          }
        }

        // 5. Điều kiện dừng tuyệt đối
        if (progressRef.current >= 100) return;

        loopTimeoutRef.current = setTimeout(loop, delay);
      };

      loop();
    }, 760);

    return () => {
      clearTimeout(startTimeoutId);
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
      }
    };
  }, [reduceMotion, status, router]);

  useEffect(() => {
    const t = setInterval(
      () => setHintIdx((i) => (i + 1) % HINTS.length),
      2000,
    );
    return () => clearInterval(t);
  }, []);

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

                {/* Animated Fill Arc */}
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
                      animate={{ strokeDashoffset: STROKE_OFFSET_TARGET }}
                      transition={{
                        duration: 2.4,
                        ease: smoothEase,
                        delay: D.ring + 0.15,
                      }}
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

              {/* Statistical Metadata Line */}
              <FadeSlide
                delay={D.stats}
                style={{ marginBottom: "clamp(24px, 3.5vh, 36px)" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {["2,847 songs", "14 playlists", "Last sync: just now"].map(
                    (text, i) => (
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
                    ),
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
              {/* Rotating Dynamic Tip */}
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
                    key={hintIdx}
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
                    {HINTS[hintIdx]}
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
                  {currentStep.label}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.22)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {progress}%
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
                {(["Library", "Playlists", "History"] as const).map(
                  (label, i) => {
                    const active = currentStep.dots[i] ?? false;
                    return (
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
                    );
                  },
                )}
              </div>
            </FadeSlide>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
