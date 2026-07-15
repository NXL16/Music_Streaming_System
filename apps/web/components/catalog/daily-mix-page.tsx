"use client";

import { CSSProperties, useEffect, useState } from "react";
import { type DailyMix, loadDailyMix } from "@/lib/recommendations/daily-mix";
import { usePlayerStore } from "@/lib/player/use-player-store";
import CardArtwork from "../media/common/card-artwork";
import ResponsiveArtwork from "../media/common/responsive-artwork";
import AmpContextMenuButton from "../custom-elements/AmpContextMenuButton";
import Link from "next/link";
import { useFormattedArtists } from "@/lib/media/use-formatted-artists";
import { getArtworkRenditionUrl, getArtworkSrcSet } from "@/lib/media/artwork";
import { formatDuration, formatSummaryDuration } from "@/lib/format/duration";

type DailyMixPageProps = {
  playlistId: string;
};

function DailyMixArtistLinks({
  artists,
  fallbackText,
}: {
  artists?: { id?: string; name: string; url?: string }[];
  fallbackText: string;
}) {
  const formattedArtists = useFormattedArtists({ artists, fallbackText });

  return (
    <>
      {formattedArtists.map((artist, index) => (
        <span key={`${artist.id}-${index}`}>
          {artist.url ? (
            <Link
              href={artist.url}
              className="overflow-hidden text-ellipsis whitespace-nowrap text-left"
            >
              {artist.name}
            </Link>
          ) : (
            <span>{artist.name}</span>
          )}
          {index < formattedArtists.length - 1 && ", "}
        </span>
      ))}
    </>
  );
}

export default function DailyMixPage({ playlistId }: DailyMixPageProps) {
  const [mix, setMix] = useState<DailyMix | null>(null);
  const [error, setError] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const setQueue = usePlayerStore((state) => state.setQueue);

  useEffect(() => {
    let active = true;

    loadDailyMix(playlistId)
      .then((nextMix) => {
        if (!active) return;
        setMix(nextMix);
        setError(nextMix === null);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
    };
  }, [playlistId]);

  if (!mix && !error) {
    return (
      <p className="mx-(--bodyGutter) pt-8 text-(--systemSecondary)">
        Đang tải...
      </p>
    );
  }

  if (!mix || error) {
    return (
      <p className="mx-(--bodyGutter) pt-8 text-red-500">
        Daily Mix chưa sẵn sàng. Vui lòng thử lại sau
      </p>
    );
  }

  const artworkImageUrl = getArtworkRenditionUrl(mix.artwork, 316);
  const artworkProps = artworkImageUrl
    ? {
        title: mix.title,
        altText: mix.title,
        imageSrcSet: getArtworkSrcSet(mix.artwork, [296, 316, 592, 632]),
        artworkColors: {
          bg: `#${mix.artwork?.bgColor?.replace(/^#/, "") || "2c2c2e"}`,
          main: `#${mix.artwork?.bgColor?.replace(/^#/, "") || "2c2c2e"}`,
        },
      }
    : null;
  const totalDurationSec = mix.tracks.reduce(
    (total, track) => total + track.durationSec,
    0,
  );
  const hasPlayableTrack = mix.tracks.some((track) => track.playbackUrl);

  return (
    <>
      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width)">
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div className="[view-timeline-name:--header-view] [view-timeline-axis:block] after:content-[''] after:bg-(--joe-color) after:block after:inset-0 after:absolute after:z-[calc(var(--z-default)-2)] min-[484px]:after:-inset-s-(--web-navigation-width)">
            <div
              className={`grid [grid-template-areas:var(--containerDetailHeaderGridAreas,'secondary-actions'_'artwork'_'headings'_'primary-actions'_'description')] [justify-items:var(--containerDetailHeaderAlign,center)] mx-(--bodyGutter) mb-(--containerDetailHeaderSpacer,32px) pt-5 min-[1000px]:grid-cols-[auto_1fr_auto] min-[1000px]:justify-items-start min-[1000px]:mb-(--containerDetailHeaderSpacer,40px) min-[1000px]:pt-2 ${mix.description ? "min-[1000px]:[grid-template-areas:'secondary-actions_secondary-actions_secondary-actions'_'artwork_headings_headings'_'artwork_description_description'_'artwork_primary-actions_primary-actions'] min-[1000px]:grid-rows-[auto_1fr_auto_auto]" : "min-[1000px]:[grid-template-areas:'secondary-actions_secondary-actions_secondary-actions'_'artwork_headings_headings'_'artwork_headings_headings'_'artwork_primary-actions_primary-actions'] min-[1000px]:grid-rows-[auto_1fr_1fr_36px]"}`}
            >
              <div
                slot="artwork"
                className="[--radiosity-effect-shadow-z:var(--z-gpu)] [align-self:start] rounded-(--global-border-radius-large,10px) [box-shadow:0_10px_20px_0_var(--radiosityShadowColor)] [grid-area:artwork] relative w-(--artworkSize,270px) z-(--radiosity-effect-shadow-z,var(--z-default)) min-[1000px]:mt-0 min-[1000px]:me-8.5"
                style={
                  {
                    "--contrast-gradient-opacity": "0",
                    "--shadow-opacity": "0",
                    "--base-border-opacity": "0",
                    "--base-border-color": "0, 0, 0",
                    "--refraction-border-opacity": "0",
                    "--sheen-overlay-opacity": "0",
                    "--pointer-pitch": "0.0000",
                    "--pointer-roll": "0.0000",
                    "--pointer-light-angle": "180.00",
                    "--pointer-active": "0",
                  } as CSSProperties
                }
              >
                {artworkProps && (
                  <>
                    <div className="[--artwork-override-max-height:100%] filter-[blur(20px)_saturate(2)] size-full opacity-30 absolute scale-[0.88] origin-[bottom_center] z-(--radiosity-effect-z,var(--z-default))">
                      <CardArtwork variant="cover" {...artworkProps} />
                    </div>

                    <div className="[background:radial-gradient(circle_at_center,#fff_0,hsla(0,0%,100%,0)_70%)] rounded-[50%] inset-[-20%] opacity-(--contrast-gradient-opacity,0) pointer-events-none absolute z-0"></div>

                    <div className="relative z-1 rounded-(--global-border-radius-large,10px) [box-shadow:calc(var(--pointer-roll,0)*8px)_calc(var(--pointer-pitch,0)*8px+3px)_10px_rgba(0,0,0,var(--shadow-opacity,0))] overflow-hidden">
                      <CardArtwork variant="cover" {...artworkProps} />

                      <div></div>

                      <div className="[background:conic-gradient(from_calc(var(--pointer-light-angle,0)*1deg)_at_50%_50%,hsla(0,0%,100%,.6)_0deg,hsla(0,0%,100%,.15)_72deg,hsla(0,0%,100%,.05)_180deg,hsla(0,0%,100%,.15)_288deg,hsla(0,0%,100%,.6)_1turn)] rounded-[inherit] inset-0 [mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] mask-exclude mix-blend-plus-lighter opacity-(--refraction-border-opacity,0) p-px pointer-events-none absolute z-3"></div>

                      <div className="[--sheen-x:calc(50%+var(--pointer-roll,0)*50%)] [--sheen-y:calc(50%+var(--pointer-pitch,0)*50%)] [background:radial-gradient(ellipse_100%_100%_at_var(--sheen-x)_var(--sheen-y),hsla(0,0%,100%,.6)_0,hsla(0,0%,100%,.3)_20%,hsla(0,0%,100%,0)_50%)] rounded-[inherit] inset-0 mix-blend-plus-lighter opacity-(--sheen-overlay-opacity,0) pointer-events-none absolute z-4"></div>
                    </div>
                  </>
                )}
              </div>

              <div
                className={`[align-items:var(--containerDetailHeaderAlign,center)] flex flex-col [grid-area:headings] mt-4.5 min-w-0 relative w-full self-center min-[1000px]:items-start min-[1000px]:self-center min-[1000px]:-mb-1.25 min-[1000px]:-mt-1.25 min-[1000px]:pb-1.25 min-[1000px]:pt-1.25}`}
              >
                <div className="empty:hidden text-(--systemSecondary) [font:var(--subhead-emphasized)] mt-2.25"></div>
                <h1 className="text-(--systemPrimary) cursor-text [font:var(--large-title-emphasized-short)] mb-[0.5px] wrap-break-word [text-align:var(--containerDetailHeaderAlign,center)] text-balance select-text line-clamp-2 min-[1000px]:[text-align:unset]">
                  <span dir="auto">{mix.title}</span>
                </h1>
                <div className="[--linkColor:var(--keyColor)] text-(--keyColor) [font:var(--large-title-short)] -m-1.25 overflow-hidden p-1.25 [text-align:var(--containerDetailHeaderAlign,center)] text-ellipsis whitespace-nowrap w-full min-[1000px]:[text-align:unset]">
                  {mix.curatorName}
                </div>
                <div className="text-(--systemSecondary) [font:var(--callout-emphasized)] mt-1 text-center">
                  Updated Today
                </div>
              </div>

              {mix.description && (
                <div className="[--truncate-font:var(--body-tall)] [grid-area:description] mt-4.5 max-w-110 min-[1000]:self-end min-[1000]:min-h-13.5 min-[1000]:mb-3.75 min-[1000]:mt-0">
                  <div className="relative z-(--z-default) text-(--systemSecondary)">
                    <p>{mix.description}</p>
                  </div>
                </div>
              )}

              <div className="[--addToLibraryMarginEnd:0] grid [grid-template-areas:'primary-start_primary-center_primary-end'] grid-cols-[1fr_auto_1fr] mt-3.5 gap-3 [grid-area:primary-actions] min-[1000px]:self-end min-[1000px]:justify-start min-[1000px]:mt-0">
                <div className="order-2 relative">
                  <div className="w-full">
                    <button
                      type="button"
                      disabled={!hasPlayableTrack}
                      onClick={() => setQueue(mix.tracks)}
                      className="[--button-action-min-width:130px] [--button-action-height:36px] bg-(--button-pill-background-color,#000) rounded-(--button-action-border-radius,24px) text-(--button-pill-color,#fff) [font:var(--title-3-semibold)] px-3 items-center flex h-(--button-action-height,36px) justify-center min-w-(--button-action-min-width-override,var(--button-action-min-width,none)) w-(--button-action-width,100%) disabled:opacity-50"
                    >
                      <span className="block">
                        <svg
                          className="[--button-action-icon-height:15px] [--button-action-icon-top-offset:0] w-[inherit] block text-current pointer-events-none shrink-0 h-(--button-action-icon-height,12px) relative top-(--button-action-icon-top-offset,1px) right-(--button-action-icon-inline-end,5px)"
                          height="16"
                          width="16"
                          viewBox="0 0 16 16"
                        >
                          <path d="m4.4 15.14 10.386-6.096c.842-.459.794-1.64 0-2.097L4.401.85c-.87-.53-2-.12-2 .82v12.625c0 .966 1.06 1.4 2 .844z"></path>
                        </svg>
                      </span>
                      <span className="contents">Play</span>
                    </button>
                  </div>
                </div>

                <div className="order-1">
                  <div className="w-full">
                    <button
                      className="[--button-action-width:36px] [--button-action-height:36px] [--button-action-min-width:none] aspect-square bg-(--button-circle-background-color,rgba(0,0,0,0.06)) [border:.75px_solid_var(--button-circle-border-color,rgba(0,0,0,0.04))] rounded-full items-center flex font-(--body-emphasized) h-(--button-action-height,36px) justify-center min-w-(--button-action-min-width-override,var(--button-action-min-width,none)) w-(--button-action-width,100%) text-(--linkColor,inherit) [text-align:inherit]"
                      aria-label="Shuffle"
                    >
                      <span className="block">
                        <svg
                          className="w-[inherit] block pointer-events-none shrink-0 h-(--button-action-icon-height,12px) relative top-(--button-action-icon-top-offset,1px) [--button-action-icon-height:14px] [--button-action-icon-top-offset:0] fill-(--button-action-fill-overrride,var(--systemPrimary)) text-(--button-action-fill-overrride,var(--systemPrimary))"
                          viewBox="0 0 18 14"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M.012 10.903c0 .43.333.732.79.732H2.54c1.272 0 2.019-.37 2.89-1.397l1.79-2.13 1.767 2.093c.894 1.065 1.737 1.434 3.009 1.434h1.478v1.782c0 .355.214.562.57.562.162 0 .31-.06.435-.155l2.898-2.418c.281-.23.281-.584 0-.828L14.48 8.161a.671.671 0 0 0-.436-.156c-.355 0-.569.2-.569.562v1.597H12.04c-.872 0-1.442-.288-2.07-1.042L8.166 6.985l1.811-2.144c.643-.761 1.161-1.035 2.019-1.035h1.478v1.627c0 .355.214.562.57.562.162 0 .31-.06.435-.156l2.898-2.417c.281-.23.281-.584 0-.828L14.48.177a.67.67 0 0 0-.436-.156c-.355 0-.569.2-.569.562v1.745h-1.471c-1.316 0-2.122.362-3.06 1.486L7.22 5.862l-1.79-2.13c-.87-1.027-1.67-1.397-2.933-1.397H.803c-.458 0-.791.303-.791.732s.333.74.79.74h1.635c.828 0 1.404.288 2.04 1.042l1.797 2.136-1.797 2.137c-.636.754-1.168 1.042-1.988 1.042H.803c-.458 0-.791.31-.791.74Z"></path>
                        </svg>
                      </span>
                    </button>
                  </div>
                </div>

                <div className="order-3">
                  <div className="[--add-to-library-button-width:36px] [--add-to-library-icon-width:12px]">
                    <div className="items-stretch flex shrink-0 h-7">
                      <button
                        className="items-center text-(--keyColor) cursor-pointer inline-flex justify-center transition-(--global-transition) h-(--add-to-library-button-width,25px) leading-0 w-(--add-to-library-button-width,25px) me-(--addToLibraryMarginEnd,4px) bg-(--add-to-library-bg-color) [border:.75px_solid_var(--add-to-library-border-color)] rounded-full"
                        aria-label="Add to library"
                        title="Add to library"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          xmlns="http://www.w3.org/2000/svg"
                          fillRule="evenodd"
                          clipRule="evenodd"
                          strokeLinejoin="round"
                          strokeMiterlimit="2"
                          className="pointer-events-none h-(--add-to-library-icon-width,12px) w-(--add-to-library-icon-width,12px) fill-(--addToLibraryFillOverride,var(--keyColor))"
                          aria-hidden="true"
                        >
                          <path
                            d="M.784 5.784h3.432v3.432c0 .43.354.784.784.784.43 0 .784-.354.784-.784V5.784h3.432a.784.784 0 1 0 0-1.568H5.784V.784A.788.788 0 0 0 5 0a.788.788 0 0 0-.784.784v3.432H.784a.784.784 0 1 0 0 1.568z"
                            fillRule="nonzero"
                          ></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 [grid-area:secondary-actions] [justify-self:var(--containerDetailHeaderAlign,end)] relative min-[1000px]:[align-self:var(--containerDetailHeaderSecondaryActionsAlignSelf,end)]">
                <div className="flex gap-2 me-[calc(var(--bodyGutter)*-1+15px)] min-[484px]:me-[calc(var(--bodyGutter)*-1+8px)]">
                  <div className="[--share-button-bg-color:transparent] [--share-button-icon-size:18px] [--share-button-icon-color:var(--systemPrimary)] items-center rounded-[1000px] gap-1 h-9 px-1 relative z-(--z-default) flex shrink-0 before:content-[''] before:backdrop-saturate-220 before:backdrop-blur-lg before:bg-(--glassMaterialBackground) before:rounded-[inherit] before:[box-shadow:0_10px_40px_var(--glassMaterialShadowColor)] before:inset-0 before:absolute after:content-[''] after:inset-0 after:[--containerInnerStroke:var(--glassMaterialInnerStroke)] after:[--containerInnerStrokeAlpha:var(--glassMaterialInnerStrokeAlpha)] after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:block after:h-0 after:max-h-full after:max-w-full after:min-h-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,0.25) after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)]">
                    <div>
                      <button
                        className="items-center bg-(--share-button-bg-color,var(--systemQuinary)) rounded-full flex h-7 justify-center relative w-7 z-[calc(var(--z-default)+1)]"
                        aria-label="Share"
                      >
                        <svg
                          className="pointer-events-none text-(--share-button-icon-color,var(--keyColor)) h-(--share-button-icon-size,14px) -translate-y-px"
                          viewBox="0 0 89.425 112.844"
                        >
                          <path
                            d="M16.539 112.844h56.347c10.823 0 16.54-5.73 16.54-16.428V48.914c-.001-10.704-5.718-16.428-16.541-16.428H59.96v10.9h12.002c4.211 0 6.593 2.176 6.593 6.637v45.284c0 4.498-2.382 6.63-6.593 6.63h-54.5c-4.276 0-6.592-2.132-6.592-6.63V50.023c0-4.46 2.316-6.637 6.592-6.637h12.16v-10.9H16.54C5.752 32.486 0 38.194 0 48.914v47.502c0 10.714 5.752 16.428 16.539 16.428Z"
                            fill="var(--shareIconColor, currentColor)"
                          ></path>
                          <path
                            d="M44.694 73.414c2.786 0 5.035-2.284 5.035-4.944V20.026l-.429-7.239 2.803 3.685 6.442 6.848a4.545 4.545 0 0 0 3.301 1.445c2.39 0 4.436-1.753 4.436-4.222 0-1.321-.51-2.242-1.42-3.115L48.564 1.73C47.27.454 46.05 0 44.694 0c-1.32 0-2.547.454-3.87 1.73L24.518 17.428c-.872.872-1.383 1.794-1.383 3.115 0 2.469 2.002 4.222 4.4 4.222a4.6 4.6 0 0 0 3.329-1.445l6.451-6.848 2.809-3.692-.429 7.246v48.445c0 2.659 2.25 4.943 4.999 4.943Z"
                            fill="var(--shareIconColor, currentColor)"
                          ></path>
                        </svg>
                      </button>
                    </div>

                    <AmpContextMenuButton />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="-ms-(--web-navigation-width) ps-(--web-navigation-width) [--songs-list-row-border-radius:12px] relative z-(--z-default) pt-0">
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div className="[--linkColor:var(--systemSecondary)] border-collapse border-spacing-0 table [font:var(--callout)] table-fixed w-[calc(100%-var(--bodyGutter)*2)] ms-(--bodyGutter) me-(--bodyGutter)">
            <div className="text-(--systemSecondary) table-row [font:var(--callout-emphasized)] relative">
              <div className="table-cell pt-0 align-middle inset-s-1.75 overflow-visible w-0 relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] h-8 pb-1.5">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap"></div>
              </div>

              <div className="table-cell pt-0 [overflow:unset] align-middle pe-0 relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] h-8 pb-1.5 rounded-ee-none rounded-es-(--songs-list-row-border-radius,6px) rounded-se-none rounded-ss-(--songs-list-row-border-radius,6px) ps-1.75 min-[1000px]:w-[50%] min-[1260px]:w-[42%]">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                  Song
                </div>
              </div>

              <div className="pt-0 align-middle pe-2.5 relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] h-8 pb-1.5 min-[1000px]:table-cell min-[1260px]:w-[29%] before:bg-(--systemQuaternary) before:rounded-[.5px] before:content-[''] before:inline-block before:h-4 before:-inset-s-3.75 before:absolute before:top-[calc(50%-3px)] before:translate-y-[-50%] before:w-px">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                  Artist
                </div>
              </div>

              <div className="pt-0 align-middle pe-4 hidden relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] h-8 pb-1.5 min-[1260px]:table-cell min-[1260px]:w-[29%] before:bg-(--systemQuaternary) before:rounded-[.5px] before:content-[''] before:inline-block before:h-4 before:-inset-s-3.75 before:absolute before:top-[calc(50%-3px)] before:translate-y-[-50%] before:w-px">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                  Album
                </div>
              </div>

              <div className="w-35.25 table-cell pt-0 align-middle overflow-visible text-end relative z-(--z-default) rounded-none [font:var(--callout-emphasized)] h-8 pb-1.5 rounded-ee-(--songs-list-row-border-radius,6px) rounded-es-none rounded-se-(--songs-list-row-border-radius,6px) rounded-ss-none pe-4.5">
                <div className="relative z-(--z-default) overflow-hidden text-ellipsis whitespace-nowrap inline-block pb-0.75 pt-0.75 ps-3.75 pe-8.75 before:bg-(--systemQuaternary) before:rounded-[.5px] before:content-[''] before:inline-block before:h-4 before:absolute before:translate-y-[-50%] before:w-px before:inset-s-0 before:top-3">
                  Time
                </div>
              </div>
            </div>

            {mix.tracks.map((track, index) => (
              <div
                key={track.id}
                className="group text-(--systemSecondary) table-row relative z-(--z-default) [--platterBorderColor:var(--pageBG)] bg-(--rowBackgroundColor,transparent) h-13.5 hover:[--playButtonOpacity:1] hover:[--addToLibraryOpacity:1] hover:[--rowBackgroundColor:var(--tracklistHoverColor)] hover:[--platterBorderColor:#f0f0f0]"
              >
                <div className="table-cell [font:var(--body)] pb-0 pt-0 align-middle h-[inherit] inset-s-1.75 overflow-visible relative z-(--z-default) after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                  <div className="grid [grid-template-areas:'favorite-or-popular'] h-full -inset-s-8.25 p-0 place-items-center absolute top-1/2 transform-[translateY(-50%)] w-6.5 z-(--z-default)">
                    <div className="[grid-area:favorite-or-popular] leading-0 place-self-stretch">
                      <button
                        className="items-center bg-(--favoriteButtonBackground,transparent) flex h-(--favoriteButtonSize,100%) justify-center leading-0 w-(--favoriteButtonSize,100%) [--favoriteIconStarOutline:var(--favoriteButtonStarOutline,transparent)] [--favoriteIconStarFill:var(--favoriteButtonStarFill,transparent)] [--favoriteButtonBackground:transparent] group-hover:[--favoriteIconStarOutline:var(--favoriteButtonStarOutline-hover,var(--keyColor))]"
                        aria-label="Favourite"
                        title="Tells us more about the kind of music you like."
                      >
                        <svg
                          width="64"
                          height="64"
                          viewBox="0 0 64 64"
                          xmlns="http://www.w3.org/2000/svg"
                          className="pointer-events-none h-(--favoriteIconSize,9px) w-(--favoriteIconSize,9px)"
                        >
                          <path
                            className="fill-(--favoriteIconStarOutline,var(--keyColor))"
                            d="M13.559 60.051c1.102.86 2.5.565 4.166-.645l14.218-10.455L46.19 59.406c1.666 1.21 3.037 1.505 4.166.645 1.102-.833 1.344-2.204.672-4.166l-5.618-16.718 14.353-10.32c1.666-1.183 2.338-2.42 1.908-3.764-.43-1.29-1.693-1.935-3.763-1.908l-17.605.108-5.348-16.8C34.308 4.496 33.34 3.5 31.944 3.5c-1.372 0-2.34.995-2.984 2.984L23.61 23.283l-17.605-.108c-2.07-.027-3.333.618-3.763 1.908-.457 1.344.242 2.58 1.909 3.763l14.352 10.321-5.617 16.718c-.672 1.962-.43 3.333.672 4.166Zm3.87-5.321c-.054-.054-.027-.081 0-.242l5.349-15.374c.376-1.049.161-1.882-.78-2.527L8.613 27.341c-.134-.08-.161-.134-.134-.215.027-.08.08-.08.242-.08l16.26.295c1.103.027 1.802-.43 2.151-1.532l4.677-15.562c.027-.162.08-.215.134-.215.08 0 .135.053.162.215l4.676 15.562c.35 1.102 1.048 1.559 2.15 1.532l16.261-.296c.162 0 .216 0 .243.081.027.08-.027.134-.135.215l-13.385 9.246c-.94.645-1.156 1.478-.78 2.527l5.35 15.374c.026.161.053.188 0 .242-.055.08-.135.026-.243-.054l-12.928-9.864c-.86-.672-1.855-.672-2.715 0l-12.928 9.864c-.107.08-.188.134-.242.054Z"
                          ></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="table-cell [font:var(--body)] pb-0 pt-0 align-middle ps-0 pe-0 text-(--systemPrimary) relative rounded-ee-none rounded-es-(--songs-list-row-border-radius,6px) rounded-se-none rounded-ss-(--songs-list-row-border-radius,6px) overflow-hidden text-ellipsis whitespace-nowrap after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                  <div className="items-center grid [grid-template-areas:'song-artwork_song-rank_song-icon_song-name'] grid-cols-[auto_auto_auto_1fr] min-h-11.5 ps-1.75">
                    <div className="text-(--systemSecondary) grid relative me-3">
                      <div className="grid [grid-area:song-artwork] [grid-template-areas:'song-index']">
                        <div className="rounded-[5px] [grid-area:song-index] [--songsListArtworkHeight:40px] h-10">
                          <div
                            className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) overflow-hidden relative w-(--artwork-override-width,100%) z-(--z-default) [--artwork-override-width:calc(var(--songsListArtworkHeight)*var(--aspect-ratio))] [--artwork-override-height:var(--songsListArtworkHeight)] after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:content-[''] after:block after:h-0 after:max-h-full after:max-w-full after:min-h-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,.25) after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)]"
                            style={
                              {
                                "--artwork-bg-color": "#0b0809",
                                "--aspect-ratio": "1",
                                "--placeholder-bg-color": "transparent",
                              } as CSSProperties
                            }
                          >
                            <ResponsiveArtwork
                              alt=""
                              className="rounded-[inherit] [transition:var(--global-transition,opacity_.1s_ease-in)] block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%)"
                              height={40}
                              sizes="40px"
                              src="/assets/artwork/1x1.gif"
                              srcSet={
                                track.thumbnailArtworkSrcSet ??
                                track.artworkSrcSet
                              }
                              style={{ opacity: 1 }}
                              width={40}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="[grid-area:song-index] opacity-(--playButtonOpacity,0) [--playButtonIconHoverColor:#fff] items-center bg-[rgba(0,0,0,.45)] rounded-[5px] flex size-full inset-s-0 justify-center absolute top-0 z-(--transgray-scrim-z,var(--z-default))">
                        <div className="[--nonPlatterIconFill:var(--nonPlatterOverrideIconColor,var(--keyColor))] h-full align-top w-full">
                          <button
                            onClick={() => {
                              setSelectedTrackId(track.id);
                              setQueue(mix.tracks, index);
                            }}
                            className="[--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] leading-0 pointer-events-auto relative z-(--z-default) h-full align-top w-full"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              xmlns="http://www.w3.org/2000/svg"
                              className="inline-block h-(--playButtonSize,16px) w-(--playButtonSize,16px) align-bottom"
                              aria-hidden="true"
                            >
                              <path
                                fill="var(--nonPlatterIconFill, var(--keyColor, black))"
                                d="m4.4 15.14 10.386-6.096c.842-.459.794-1.64 0-2.097L4.401.85c-.87-.53-2-.12-2 .82v12.625c0 .966 1.06 1.4 2 .844z"
                              ></path>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="items-center inline-flex [grid-area:song-name] leading-4 overflow-hidden w-full -my-1 -mx-1 py-1 px-1">
                      <div className="block cursor-default flex-1 overflow-hidden ps-1 pe-1 -me-1 pb-1 pt-1 -ms-1 -mb-1 -mt-1 text-left">
                        {track.url ? (
                          <Link
                            href={track.url}
                            className="overflow-hidden [--linkColor:var(--systemPrimary)] hover:underline"
                          >
                            <div className="overflow-hidden text-ellipsis inline text-pretty whitespace-normal text-left">
                              {track.title}
                            </div>
                          </Link>
                        ) : (
                          <div className="overflow-hidden text-ellipsis inline text-pretty whitespace-normal text-left">
                            {track.title}
                          </div>
                        )}

                        <div className=""></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden [font:var(--body)] pb-0 pt-0 align-middle pe-2.5 relative overflow-hidden text-ellipsis whitespace-nowrap min-[1000px]:table-cell after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap -mb-1-mt-1 -ms-1 -me-1 pb-1 pt-1 pe-1 ps-1 text-left">
                    <DailyMixArtistLinks
                      artists={track.artists}
                      fallbackText={track.artist}
                    />
                  </div>
                </div>

                <div className="hidden [font:var(--body)] pb-0 pt-0 align-middle pe-4 relative overflow-hidden text-ellipsis whitespace-nowrap min-[1260px]:table-cell after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap -mb-1-mt-1 -ms-1 -me-1 pb-1 pt-1 pe-1 ps-1 text-left">
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-left">
                      {track.albumUrl ? (
                        <Link href={track.albumUrl} className="hover:underline">
                          {track.album}
                        </Link>
                      ) : (
                        track.album
                      )}
                    </span>
                  </div>
                </div>

                <div className="table-cell [font:var(--body)] pb-0 pt-0 align-middle overflow-visible relative text-end z-(--z-default) rounded-ee-(--songs-list-row-border-radius,6px) rounded-es-none rounded-se-(--songs-list-row-border-radius,6px) rounded-ss-none pe-4.5 after:[border-top:.5px_solid_var(--labelDivider)] after:content-[''] after:block after:h-px after:inset-s-0 after:absolute after:top-0 after:w-full group-hover:after:opacity-0">
                  <div className="items-center inline-grid [grid-template-areas:'song-controls-add_song-controls-length_song-controls-context'] relative">
                    <div className="[grid-area:song-controls-add] opacity-(--addToLibraryOpacity,0) me-1.75">
                      <button className="items-center text-(--keyColor) cursor-pointer inline-flex justify-center [transition:var(--global-transition)] h-(--add-to-library-button-width,25px) leading-0 w-(--add-to-library-button-width,25px) me-(--addToLibraryMarginEnd,4px)">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          xmlns="http://www.w3.org/2000/svg"
                          fillRule="evenodd"
                          clipRule="evenodd"
                          strokeLinejoin="round"
                          strokeMiterlimit="2"
                          className="h-(--add-to-library-icon-width,12px) w-(--add-to-library-icon-width,12px) fill-(--keyColor)"
                          aria-hidden="true"
                        >
                          <path
                            d="M.784 5.784h3.432v3.432c0 .43.354.784.784.784.43 0 .784-.354.784-.784V5.784h3.432a.784.784 0 1 0 0-1.568H5.784V.784A.788.788 0 0 0 5 0a.788.788 0 0 0-.784.784v3.432H.784a.784.784 0 1 0 0 1.568z"
                            fillRule="nonzero"
                          ></path>
                        </svg>
                      </button>
                    </div>

                    <time
                      className="[grid-area:song-controls-length] cursor-default inline-block leading-9.5 font-features-['tnum'] tabular-nums"
                      dateTime="PT1M27S"
                    >
                      {formatDuration(track.durationSec)}
                    </time>

                    <div
                      className={`[grid-area:song-controls-context] ms-1.75 [--contextMenuButtonSize:28px] ${selectedTrackId === track.id ? "[--contextMenuEllipsisFillOverride:#fff]" : "[--contextMenuEllipsisFillOverride:var(--systemSecondary)] hover:[--contextMenuEllipsisFillOverride:var(--keyColor)]"}`}
                    >
                      <AmpContextMenuButton />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="-ms-(--web-navigation-width) ps-(--web-navigation-width) pt-3 [--songs-list-row-border-radius:12px] relative z-(--z-default)">
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div className="m-[0_var(--bodyGutter)] pb-10.75 ps-3 -mt-3 min-[1000px]:flex min-[1000px]:flex-row min-[1000px]:justify-between min-[1000px]:pb-13.25">
            <div className="text-(--systemSecondary) max-w-110 relative [font:var(--body-tall)] mt-11 min-[1260px]:max-w-135 min-[1000px]:mt-8.5">
              <p className="whitespace-pre-wrap">{`${mix.curatorName}\n${mix.tracks.length} songs, ${formatSummaryDuration(totalDurationSec)}`}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
