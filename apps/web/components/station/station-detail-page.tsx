"use client";

import { useEffect, useState } from "react";
import { getArtworkSrcSet } from "@/lib/media/artwork";
import {
  getSystemStationDetail,
  playSystemStation,
  type SystemStationDetail,
} from "@/lib/recommendations/stations-for-you";
import { useAppScrollToTop } from "@/lib/layout/use-app-scroll-to-top";
import { useAuthStore } from "@/lib/auth/auth-store";
import AmpContextMenuButton from "../custom-elements/AmpContextMenuButton";
import CardArtwork from "../media/common/card-artwork";

type StationDetailPageProps = {
  stationId: string;
};

export function StationDetailPage({ stationId }: StationDetailPageProps) {
  const userId = useAuthStore((state) => state.user?.userId);
  const [resolvedStation, setResolvedStation] = useState<{
    stationId: string;
    detail: SystemStationDetail | null;
  } | null>(null);
  const [playing, setPlaying] = useState(false);
  const loading = resolvedStation?.stationId !== stationId;
  const station = loading ? null : resolvedStation.detail;

  useAppScrollToTop(stationId);

  useEffect(() => {
    let active = true;

    void getSystemStationDetail(stationId).then((detail) => {
      if (active) {
        setResolvedStation({ stationId, detail });
      }
    });

    return () => {
      active = false;
    };
  }, [stationId]);

  const handlePlay = async () => {
    if (playing) return;
    setPlaying(true);
    try {
      await playSystemStation(stationId);
    } finally {
      setPlaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full animate-pulse" aria-label="Đang tải station" />
    );
  }

  if (!station) {
    return (
      <section className="flex min-h-full items-center justify-center px-6">
        <p className="text-(--systemSecondary) [font:var(--body)]">
          Station này hiện không khả dụng.
        </p>
      </section>
    );
  }

  const artworkColor = station.artwork?.bgColor
    ? `#${station.artwork.bgColor.replace(/^#/, "")}`
    : "#2c2c2e";
  const artworkProps = {
    title: station.name,
    altText: station.name,
    imageSrcSet: getArtworkSrcSet(station.artwork, [316, 632, 960]),
    artworkColors: {
      bg: artworkColor,
      main: artworkColor,
    },
  };

  return (
    <div className="items-center flex flex-col justify-start min-[1000px]:bottom-0 min-[1000px]:inset-x-0 min-[1000px]:justify-center min-[1000px]:m-auto min-[1000px]:absolute min-[1000px]:top-0 min-[1000px]:z-1 max-[999px]:p-(--bodyGutter)">
      <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
        <div className="flex flex-col gap-3.75 min-[1000px]:flex-row min-[1000px]:gap-10">
          <div className="[--radiosity-effect-shadow-z:var(--z-gpu)] [align-self:start] rounded-(--global-border-radius-large,10px) [box-shadow:0_10px_20px_0_var(--radiosityShadowColor)] [grid-area:artwork] relative w-(--artworkSize,270px) z-(--radiosity-effect-shadow-z,var(--z-default)) min-[1000px]:mt-0 max-[999px]:m-[15px_auto_0] [@supports(animation-timeline:scroll())]:max-[483px]:motion-safe:animate-[artwork-scroll-effects_linear] [@supports(animation-timeline:scroll())]:max-[483px]:motion-safe:will-change-[transform,opacity,filter] [@supports(animation-timeline:scroll())]:max-[483px]:motion-safe:[animation-timeline:--header-view] [@supports(animation-timeline:scroll())]:max-[483px]:motion-safe:[animation-range:exit]">
            <div className="[--artwork-override-max-height:100%] filter-[blur(20px)_saturate(2)] size-full opacity-40 absolute transform-[scale(.88)] origin-[bottom_center] z-(--radiosity-effect-z,var(--z-default)) dark:opacity-30">
              <CardArtwork variant="cover" {...artworkProps} />
            </div>

            <div className="[background:radial-gradient(circle_at_center,#fff_0,hsla(0,0%,100%,0)_70%)] rounded-[50%] inset-[-20%] opacity-(--contrast-gradient-opacity,0) pointer-events-none absolute z-0"></div>

            <div className="relative z-1 rounded-(--global-border-radius-large,10px) [box-shadow:calc(var(--pointer-roll,0)*8px)_calc(var(--pointer-pitch,0)*8px+3px)_10px_rgba(0,0,0,var(--shadow-opacity,0))] overflow-hidden">
              <CardArtwork variant="cover" {...artworkProps} />

              <div className="[background:conic-gradient(from_calc(var(--pointer-light-angle,0)*1deg)_at_50%_50%,hsla(0,0%,100%,.6)_0deg,hsla(0,0%,100%,.15)_72deg,hsla(0,0%,100%,.05)_180deg,hsla(0,0%,100%,.15)_288deg,hsla(0,0%,100%,.6)_1turn)] rounded-[inherit] inset-0 [mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] mask-exclude mix-blend-plus-lighter opacity-(--refraction-border-opacity,0) p-px pointer-events-none absolute z-3"></div>

              <div className="[--sheen-x:calc(50%+var(--pointer-roll,0)*50%)] [--sheen-y:calc(50%+var(--pointer-pitch,0)*50%)] [background:radial-gradient(ellipse_100%_100%_at_var(--sheen-x)_var(--sheen-y),hsla(0,0%,100%,.6)_0,hsla(0,0%,100%,.3)_20%,hsla(0,0%,100%,0)_50%)] rounded-[inherit] inset-0 mix-blend-plus-lighter opacity-(--sheen-overlay-opacity,0) pointer-events-none absolute z-4"></div>
            </div>
          </div>

          <div className="items-center flex flex-col shrink-0 min-[1000px]:items-start justify-center max-w-(--radioHeaderDetailWidth,350px)">
            <h1 className="[font:var(--large-title-emphasized)] line-clamp-2 mb-1.5">
              {station.name}
            </h1>
            {station.description && (
              <p className="text-(--systemSecondary) [font:var(--large-title)] mb-2 line-clamp-2 max-[999px]:text-center">
                {station.description}
              </p>
            )}
            <p className="text-(--systemSecondary) [font:var(--subhead-emphasized)]">
              Radio Station
            </p>

            <div className="items-center flex mt-6.25 w-full max-[999px]:justify-center">
              <div className="min-w-25 w-auto">
                <button
                  type="button"
                  className=" items-center flex [font:var(--body-emphasized)] h-(--button-action-height,30px) justify-center min-w-(--button-action-min-width-override,var(--button-action-min-width,none)) w-(--button-action-width,100%) bg-(--button-action-background-color,var(--keyColorBG)) text-(--button-action-color,#fff) rounded-(--button-action-border-radius,7px) p-(--button-action-padding,0_10px) min-[1260px]:min-w-(--button-action-min-width,100px) min-[1260px]:w-(--button-action-width,auto) min-[1260px]:h-(--button-action-height,29px)"
                  disabled={playing}
                  onClick={() => void handlePlay()}
                >
                  <span className="inline-block align-baseline w-4 me-0.5 mb-0.5">
                    <svg
                      height="16"
                      viewBox="0 0 16 16"
                      width="16"
                      className="h-(--button-action-icon-height,12px) relative top-(--button-action-icon-top-offset,1px) shrink-0 w-[inherit] block text-current pointer-events-none fill-white"
                    >
                      <path d="m4.4 15.14 10.386-6.096c.842-.459.794-1.64 0-2.097L4.401.85c-.87-.53-2-.12-2 .82v12.625c0 .966 1.06 1.4 2 .844z"></path>
                    </svg>
                  </span>

                  <span className="">Play</span>
                </button>
              </div>
              <div className="ms-3">
                <AmpContextMenuButton
                  id={`station-${stationId}`}
                  context={{
                    kind: "station",
                    stationId,
                    title: station.name,
                    userId,
                  }}
                  hasPlatter
                  className="more-button--material"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
