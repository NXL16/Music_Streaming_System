"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  navigateFromIntro,
  type IntroDestination,
} from "@/lib/auth/intro-navigation";
import { Wordmark } from "./wordmark";
import { IntroTransitionContext } from "./intro-transition-context";
import styles from "./intro.module.css";

export function IntroTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const navigation = useRef<(() => void) | undefined>(undefined);
  const [phase, setPhase] = useState<"cover" | "home" | null>(null);
  const startNavigation = useCallback(
    (href: IntroDestination) => {
      navigation.current?.();
      setPhase(href === "/home" ? "cover" : null);
      navigation.current = navigateFromIntro(href, (target) =>
        router.replace(target),
      );
    },
    [router],
  );
  const revealing = pathname === "/home";
  const visible = phase === "cover" && (pathname === "/" || revealing);
  const homeNavigation = phase !== null && revealing;
  const context = useMemo(
    () => ({ navigateFromIntro: startNavigation, homeNavigation }),
    [startNavigation, homeNavigation],
  );

  useEffect(() => () => navigation.current?.(), []);

  useEffect(() => {
    if (phase === null || pathname === "/" || (phase === "home" && revealing))
      return;
    const timer = window.setTimeout(
      () => setPhase(revealing ? "home" : null),
      revealing ? 2000 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [phase, pathname, revealing]);

  return (
    <IntroTransitionContext value={context}>
      <div
        className={styles.app}
        inert={visible}
        aria-hidden={visible || undefined}
      >
        {children}
      </div>
      {visible && (
        <div
          className={`${styles.page} ${styles.cover}`}
          data-home-intro-cover
          data-phase={revealing ? "revealing" : "waiting"}
          role="status"
          aria-label="Opening your music"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setPhase("home");
          }}
        >
          <Wordmark className={styles.logo} intro />
        </div>
      )}
    </IntroTransitionContext>
  );
}
