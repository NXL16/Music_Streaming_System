"use client";

import Link from "next/link";
import { useState } from "react";
import { ContentDialog } from "@/components/catalog/content-dialog";
import { SHARED_FEEDBACK_OPEN_EVENT } from "@/components/reports/shared-feedback-dialog";

type LegalTopicKey = "terms" | "privacy" | "cookies";

const LEGAL_TOPICS: Record<
  LegalTopicKey,
  { label: string; title: string; subtitle: string; body: string[] }
> = {
  terms: {
    label: "Terms of Service",
    title: "Terms of Service",
    subtitle: "404hz Melodies",
    body: [
      "By accessing or using 404hz Melodies, you agree to stream audio and video content for personal, non-commercial listening only.",
      "You are responsible for keeping your account credentials secure and for any activity performed through your signed-in sessions.",
      "Wallet balances, Coin top-ups, and withdrawals are subject to verification and standard anti-fraud checks.",
    ],
  },
  privacy: {
    label: "Privacy Policy",
    title: "Privacy Policy",
    subtitle: "How 404hz Melodies handles your data",
    body: [
      "We collect only the account information needed to authenticate you, personalize recommendations, and process wallet transactions.",
      "Listening history and library items stay tied to your profile and can be reviewed or managed from Settings at any time.",
      "We do not sell your personal information or share private account details with third parties outside essential infrastructure providers.",
    ],
  },
  cookies: {
    label: "Cookie Notice",
    title: "Cookie Notice",
    subtitle: "Session & playback preferences",
    body: [
      "404hz Melodies uses essential cookies and local storage solely to maintain your sign-in session, security tokens, and playback settings.",
      "Optional UI preferences such as theme, volume, and lyrics motion are stored locally in your browser.",
    ],
  },
};

const FOOTER_ITEMS: Array<
  | { key: LegalTopicKey; label: string; kind: "legal" }
  | { key: "feedback" | "support"; label: string; kind: "feedback" }
> = [
  { key: "terms", label: "Terms of Service", kind: "legal" },
  { key: "privacy", label: "Privacy Policy", kind: "legal" },
  { key: "cookies", label: "Cookie Notice", kind: "legal" },
  { key: "support", label: "Support", kind: "feedback" },
  { key: "feedback", label: "Feedback", kind: "feedback" },
];

export function AppFooter() {
  const [activeTopic, setActiveTopic] = useState<LegalTopicKey | null>(null);
  const topicContent = activeTopic ? LEGAL_TOPICS[activeTopic] : null;

  return (
    <div className="app-footer contents dark:[--labelDivider:var(--labelDivider-vibrantOnDark)] [--labelDivider:var(--labelDivider-vibrantOnLight)] in-[.app-container.has-theme-override]:[--footerBg:var(--joe-color)] [.app-container[class~='has-theme-override']:has(.section--alternate)_&]:[--footerBg:var(--opaqueShelfBG-blended-plusD)]">
      <footer className="bg-(--footerBg) block shrink-0 font-sans text-[10px] font-normal tracking-normal leading-[1.3] min-h-36.75 py-(--footerVerticalPadding,15px) px-(--bodyGutter) relative z-(--z-default) after:inset-s-(--bodyGutter) after:inset-e-(--bodyGutter) min-[484px]:after:inset-s-[calc(var(--web-navigation-width)+var(--bodyGutter))] after:absolute after:top-0 after:z-[calc(var(--z-default)-1)] [.app-container.has-theme-override_&]:after:[border-bottom:.5px_solid_var(--labelDivider)] min-[480px]:-ms-(--web-navigation-width) min-[480px]:ps-[calc(var(--web-navigation-width)+var(--bodyGutter))] min-[740px]:font-sans min-[740px]:text-[11px] min-[740px]:font-normal min-[740px]:tracking-normal min-[740px]:leading-[1.2727272727] min-[740px]:min-h-22 min-[740px]:pb-[calc(76px+var(--footerVerticalPadding,14px))] min-[740px]:pt-(--footerVerticalPadding,14px) min-[1680px]:content-start min-[1680px]:items-baseline min-[1680px]:[display:var(--footerDisplay,flex)] min-[1680px]:justify-between max-[483px]:pb-[calc(74px+var(--footerVerticalPadding,15px))] min-[484px]:max-[740px]:pb-[calc(74px+var(--footerVerticalPadding,15px))]">
        <div className="[--linkColor:var(--systemPrimary)] font-sans order-1 min-[740px]:order-2 max-[739px]:min-w-auto">
          <div className="flex mb-6.25">
            <span className="text-(--systemPrimary) inline-flex leading-none mt-1.5 align-middle whitespace-nowrap">
              Vietnam
            </span>

            <ul className="flex flex-wrap ps-2.5">
              <li className="inline-flex leading-none mt-1.5 align-middle before:content-[''] [border-inline-start:1px_solid_var(--systemQuaternary)] before:h-full">
                <span className="text-(--systemSecondary) pe-2.5 whitespace-nowrap ps-2.5">
                  English
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="min-[740px]:order-1">
          <p className="text-(--systemSecondary) mb-1.25">
            <span dir="ltr">
              <span dir="auto">Copyright © 2026</span>
              <Link
                href="/home"
                className="[--linkColor:var(--systemPrimary)] ms-0.75"
              >
                <span dir="auto">404hz Melodies.</span>
              </Link>
            </span>
            <span dir="auto" className="ms-0.75">
              All rights reserved.
            </span>
          </p>

          <ul className="flex flex-wrap">
            {FOOTER_ITEMS.map((item, index) => {
              const isLast = index === FOOTER_ITEMS.length - 1;

              return (
                <li
                  key={item.key}
                  className={[
                    "inline-flex leading-none mt-1.5 align-middle",
                    !isLast &&
                      "after:content-[''] after:inline-block after:[border-inline-start:1px_solid_var(--systemQuaternary)] after:pe-2.5",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <button
                    type="button"
                    className="link h-full pe-2.5 cursor-pointer"
                    onClick={() => {
                      if (item.kind === "feedback") {
                        window.dispatchEvent(
                          new Event(SHARED_FEEDBACK_OPEN_EVENT),
                        );
                        return;
                      }
                      setActiveTopic(item.key);
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </footer>

      <ContentDialog
        open={Boolean(topicContent)}
        title={topicContent?.title ?? ""}
        subtitle={topicContent?.subtitle ?? ""}
        hideGradient
        onClose={() => setActiveTopic(null)}
      >
        {topicContent && (
          <div className="grid gap-3.5 pb-4 text-[14px] leading-relaxed text-(--systemSecondary)">
            {topicContent.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        )}
      </ContentDialog>
    </div>
  );
}
