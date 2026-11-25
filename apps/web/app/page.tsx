"use client";

import {
  useContext,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { IntroTransitionContext } from "@/components/brand/intro-transition-context";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";
import {
  getHomeRecommendations,
  getRecommendationSection,
} from "@/lib/recommendations/recommendation.api";
import { RECENTLY_PLAYED_SHELF_ID } from "@/lib/recommendations/recently-played-presentation";
import styles from "@/components/brand/intro.module.css";

const INTRO_LETTER_COUNT = 8; // "Melodies"
const INTRO_ANIMATION_FALLBACK_MS = 6000;

export default function SplashScreen() {
  const router = useRouter();
  const { navigateFromIntro } = useContext(IntroTransitionContext);
  const status = useAuthStore((state) => state.status);
  const [loading, setLoading] = useMinimumLoadingState(true, 3800);
  const [animationDone, setAnimationDone] = useState(false);
  const settleDoneRef = useRef(false);
  const inkEndedCountRef = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(() => setAnimationDone(true));
      return () => window.cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(
      () => setAnimationDone(true),
      INTRO_ANIMATION_FALLBACK_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setLoading(status === "checking");
    if (status === "checking") return;

    router.prefetch(status === "authenticated" ? "/home" : "/login");
    if (status === "authenticated") {
      void Promise.allSettled([
        getHomeRecommendations(),
        getRecommendationSection(RECENTLY_PLAYED_SHELF_ID),
      ]);
    }
  }, [status, router, setLoading]);

  useEffect(() => {
    if (loading || !animationDone || status === "checking") return;
    const target = status === "authenticated" ? "/home" : "/login";
    navigateFromIntro(target);

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && window.location.pathname === "/") {
        navigateFromIntro(target);
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [loading, animationDone, status, navigateFromIntro]);

  function handleAnimationEnd(event: AnimationEvent<HTMLElement>) {
    if (event.animationName.includes("settle")) {
      settleDoneRef.current = true;
    } else if (event.animationName.includes("ink")) {
      inkEndedCountRef.current += 1;
    }
    if (
      settleDoneRef.current &&
      inkEndedCountRef.current >= INTRO_LETTER_COUNT
    ) {
      setAnimationDone(true);
    }
  }

  return (
    <main
      className={styles.page}
      aria-busy="true"
      onAnimationEnd={handleAnimationEnd}
    >
      <Wordmark className={styles.logo} intro />
      <span className="sr-only" role="status">
        Loading…
      </span>
    </main>
  );
}
