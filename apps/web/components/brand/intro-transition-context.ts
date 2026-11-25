"use client";

import { createContext } from "react";
import type { IntroDestination } from "@/lib/auth/intro-navigation";

export const IntroTransitionContext = createContext<{
  navigateFromIntro: (href: IntroDestination) => void;
  homeNavigation: boolean;
}>({
  navigateFromIntro: () => {},
  homeNavigation: false,
});
