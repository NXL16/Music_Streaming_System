import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import Loading from "./loading";
import { IntroTransitionContext } from "@/components/brand/intro-transition-context";

function render(homeNavigation: boolean, fullScreen = true) {
  return renderToStaticMarkup(
    createElement(
      IntroTransitionContext.Provider,
      { value: { navigateFromIntro: () => {}, homeNavigation } },
      createElement(Loading, { fullScreen }),
    ),
  );
}

it("renders no extra loading UI throughout intro navigation to Home", () => {
  expect(render(true)).toBe("");
});

it("preserves the normal page loader outside intro navigation", () => {
  expect(render(false)).toContain("ispinner");
});

it("preserves inline loaders during intro navigation", () => {
  expect(render(true, false)).toContain("ispinner");
});
