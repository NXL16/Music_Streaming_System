"use client";

import { CSSProperties, useState } from "react";
import { useRouter } from "next/navigation";
import AmpContextMenuButton from "../custom-elements/AmpContextMenuButton";
import AmbientVideo from "../custom-elements/AmpVideo";
import CardArtwork from "../media/common/card-artwork";
import { useCatalogArtist } from "@/lib/catalog/use-catalog-artist";
import { catalogArtworkSrcSet } from "@/lib/catalog/catalog.mapper";
import { playCatalogResource } from "@/lib/catalog/play-catalog-resource";
import { usePlayerStore } from "@/lib/player/use-player-store";
import { albumRoute } from "@/lib/catalog/album-route";
import { artistTopSongsRoute } from "@/lib/catalog/artist-route";
import { getAllCatalogArtistSongs } from "@/lib/catalog/artist-song-pages";
import Link from "next/link";
import CardContextMenu from "../media/common/card-context-menu";
import CardPlayButton from "../media/common/card-play-button";
import CatalogPageLoading from "../loading/catalog-page-loading";

type ArtistDetailPageProps = {
  artistId: string;
  slug: string;
};

const latestReleaseDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatLatestReleaseDate(dateValue?: string) {
  if (!dateValue) return "";

  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateValue;

  return latestReleaseDateFormatter.format(date).toUpperCase();
}

export function ArtistDetailPage({ artistId, slug }: ArtistDetailPageProps) {
  const router = useRouter();
  const { artist, albums, songs, loading } = useCatalogArtist(artistId);
  const setQueue = usePlayerStore((state) => state.setQueue);
  const startStation = usePlayerStore((state) => state.startStation);
  const [startingStation, setStartingStation] = useState(false);

  if (loading) {
    return <CatalogPageLoading />;
  }

  const artistName = artist?.attributes?.name;

  const artworkColor = artist?.attributes?.artwork?.bgColor
    ? `#${artist.attributes.artwork.bgColor.replace(/^#/, "")}`
    : "#000000";

  const poster = artist?.attributes?.editorialVideo?.primary?.variants?.poster;
  const artwork = artist?.attributes?.artwork;

  const renditions =
    poster?.variants?.renditions || artwork?.variants?.renditions || [];

  const imageSrcSet =
    renditions.length > 0
      ? renditions.map((r) => `${r.url} ${r.width}w`).join(", ")
      : poster?.url
        ? `${poster.url} 2400w`
        : artwork?.url
          ? `${artwork.url} 2400w`
          : "";

  const videoSrc = artist?.attributes?.editorialVideo?.primary?.video;
  const latestRelease = albums[0];
  const latestReleaseArtwork = latestRelease?.attributes.artwork;
  const latestReleaseArtworkColor = latestReleaseArtwork?.bgColor
    ? `#${latestReleaseArtwork.bgColor.replace(/^#/, "")}`
    : "var(--genericJoeColor)";
  const latestReleaseSrcSet = catalogArtworkSrcSet(
    latestReleaseArtwork,
    [296, 316, 592, 632],
  );
  const latestReleaseDate = formatLatestReleaseDate(
    latestRelease?.attributes.releaseDate,
  );
  const latestReleaseIsExplicit =
    latestRelease?.attributes.contentRating === "explicit";
  const latestReleaseTrackCount = latestRelease?.attributes.trackCount;
  const topSongPreview = songs.slice(0, 9);

  const playArtistStation = async () => {
    if (startingStation) return;

    setStartingStation(true);
    try {
      startStation(await getAllCatalogArtistSongs(artistId));
    } catch {
      return;
    } finally {
      setStartingStation(false);
    }
  };

  return (
    <>
      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3">
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div className="overflow-hidden relative h-[calc((100vw-var(--web-navigation-width))/2.28571)] min-h-81 min-[1000px]:max-h-[calc(1680px/var(--fixed-artwork-ratio-lg,2.5714285714))] min-[1000px]:relative min-[1000px]:z-(--z-default) min-[1260px]:h-[calc((100vw-var(--web-navigation-width))/2.57143)] min-[1260px]:max-h-[653.33333px] before:bg-transparent before:bg-none before:bg-top before:bg-no-repeat before:bg-cover before:content-[''] before:h-[calc((100vw-var(--sidebar-width-expanded,260px))/var(--fixed-artwork-ratio-lg,2.2857142857))] before:max-h-[calc(1680px/var(--fixed-artwork-ratio-sm,2.5714285714))] before:max-w-[1680px] before:absolute before:w-[calc(100vw-var(--sidebar-width-expanded,260px))] before:z-(--z-default) min-[1000px]:before:bg-(--background-color) min-[1000px]:before:bg-(image:--background-image-xs) min-[1260px]:before:bg-(image:--background-image) min-[1260px]:before:h-[calc((100vw-var(--sidebar-width-expanded,260px))/var(--fixed-artwork-ratio-sm,2.5714285714))] after:bg-[linear-gradient(0deg,rgba(0,0,0,.36)_0,rgba(0,0,0,.25)_36%,transparent)] after:bottom-0 after:content-[''] after:block after:left-0 after:pointer-events-none after:absolute after:right-0 after:top-auto after:z-(--z-default) after:h-37.5">
            <div className="rounded-[inherit] [--artist-header-aspect-ratio:2.2857142857] [--artwork-override-width:100vw] [--artwork-override-height:calc(var(--artwork-override-width)/var(--artist-header-aspect-ratio))] [--artwork-override-min-height:324px] [--artwork-override-max-width:1680px] [--artwork-override-max-height:calc(1680px/2.5714285714)] inset-s-auto static min-[484px]:[--artwork-override-width:calc(100vw-var(--web-navigation-width))] min-[484px]:[--artwork-override-height:calc(var(--artwork-override-width)/var(--artist-header-aspect-ratio))] min-[484px]:h-(--artwork-override-height) min-[484px]:max-h-(--artwork-override-max-height) min-[484px]:max-w-(--artwork-override-max-width) min-[484px]:min-h-(--artwork-override-min-height) min-[484px]:w-(--artwork-override-width)">
              <CardArtwork
                variant="cover"
                sizes="1200px"
                artworkColors={{ bg: artworkColor, main: artworkColor }}
                imageSrcSet={imageSrcSet}
                title={artistName!}
                altText={artistName}
              />

              {videoSrc && (
                <div className="rounded-[inherit] size-full pointer-events-none absolute inset-0 z-(--z-default) min-h-81 overflow-hidden [-webkit-box-reflect:above]">
                  <AmbientVideo variant="artist" keepAlive src={videoSrc} />
                </div>
              )}
            </div>

            <div className="items-end bottom-0 grid [grid-template-areas:'._classical_favorite_menu'_'._._._.'_'badge_._._.'_'artist_._play_play'] grid-cols-[1fr_auto] grid-rows-[auto_minmax(16px,1fr)_auto_auto] size-full justify-end pt-5 px-(--bodyGutter) pb-5.75 absolute z-[calc(var(--z-default)+1)] min-[1000px]:[grid-template-areas:'badge_badge_._._.'_'play_artist_classical_favorite_menu'] min-[1000px]:grid-cols-[auto_1fr_auto_auto_auto] min-[1000px]:grid-rows-[auto_auto] min-[1000px]:h-auto">
              <h1 className="text-(--artist-header-name-color,var(--systemPrimary)) cursor-text [font:var(--header-emphasized)] [grid-area:artist] text-clip select-text line-clamp-2 [--artist-header-name-color:#fff] supports-[mask-image:linear-gradient(white,black)]:[-webkit-mask:linear-gradient(270deg,transparent,#000_36px)] supports-[mask-image:linear-gradient(white,black)]:[mask:linear-gradient(270deg,transparent,#000_36px)] supports-[mask-image:linear-gradient(white,black)]:[-webkit-mask-position:right] supports-[mask-image:linear-gradient(white,black)]:mask-right supports-[mask-image:linear-gradient(white,black)]:relative supports-[mask-image:linear-gradient(white,black)]:z-(--z-default)">
                {artistName}
              </h1>

              <span className="[--playButtonSize:36px] self-end [grid-area:play] h-(--playButtonSize) justify-self-end -translate-y-px w-(--playButtonSize) min-[1000px]:me-4">
                <button
                  aria-label={`Play ${artistName ?? "artist"} station`}
                  className="[--iconCircleFillBG:var(--playButtonCircleHoverColor,var(--keyColor,#000))] [--iconFillArrow:var(--playButtonIconHoverColor,#fff)] [--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] pointer-events-auto relative z-(--z-default) rounded-full block leading-0 not-focus:shadow-[0_2px_10px_rgba(0,0,0,0.2)]"
                  onClick={() => void playArtistStation()}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="inline-block h-(--playButtonSize,30px) w-(--playButtonSize,30px) rounded-[50%] backdrop-filter-none bg-transparent"
                  >
                    <use href="#play-circle-fill"></use>
                  </svg>
                </button>
              </span>

              <span className="[--favoriteButtonBackground:transparent] [--favoriteButtonStarOutline:#fff] [--favoriteButtonStarCutout:transparent] [--favoriteButtonStarFill:transparent] [--favoriteButtonBackground-hover:transparent] [--favoriteButtonStarOutline-hover:#fff] [--favoriteButtonStarCutout-hover:transparent] [--favoriteButtonStarFill-hover:transparent] [--badgeColor:rgba(0,0,0,.5)] bg-[rgba(40,40,40,.5)] supports-[backdrop-filter:blur(10px)]:backdrop-saturate-180 supports-[backdrop-filter:blur(10px)]:backdrop-blur-[60px] rounded-full [grid-area:favorite] ms-2">
                <button className="items-center flex h-(--favoriteButtonSize,100%) justify-center leading-0 w-(--favoriteButtonSize,100%) [--favoriteIconStarOutline:var(--favoriteButtonStarOutline)] bg-(--favoriteButtonBackground,var(--systemQuinary)) rounded-[50%]">
                  <svg
                    width="60"
                    height="60"
                    viewBox="0 0 60 60"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-(--favoriteIconSize,28px) w-(--favoriteIconSize,28px)"
                  >
                    <path
                      className="fill-(--favoriteIconStarOutline,var(--keyColor))"
                      d="M18.907 45.857c.665.518 1.508.34 2.513-.39l8.575-6.305 8.592 6.305c1.005.73 1.831.908 2.512.39.665-.503.81-1.33.405-2.513L38.116 33.26l8.657-6.225c1.005-.713 1.41-1.459 1.15-2.27-.259-.777-1.02-1.166-2.269-1.15l-10.618.065-3.225-10.132c-.39-1.2-.973-1.799-1.816-1.799-.827 0-1.41.6-1.8 1.8L24.97 23.68l-10.618-.064c-1.248-.016-2.01.373-2.27 1.15-.275.811.146 1.557 1.152 2.27l8.656 6.225-3.388 10.083c-.405 1.183-.26 2.01.405 2.513Zm2.334-3.21c-.032-.033-.016-.049 0-.146l3.226-9.272c.227-.633.098-1.135-.47-1.524l-8.073-5.576c-.08-.05-.097-.081-.08-.13.016-.049.048-.049.145-.049l9.808.179c.664.016 1.086-.26 1.296-.924l2.821-9.386c.016-.098.049-.13.081-.13.049 0 .081.032.097.13l2.82 9.386c.212.664.633.94 1.298.924l9.807-.179c.097 0 .13 0 .146.049.016.049-.016.08-.081.13l-8.073 5.576c-.567.389-.697.891-.47 1.524l3.226 9.272c.016.097.032.113 0 .146-.033.048-.081.016-.146-.033l-7.797-5.949c-.519-.405-1.119-.405-1.637 0l-7.798 5.95c-.065.048-.113.08-.146.032Z"
                    ></path>
                  </svg>
                </button>
              </span>

              <span className="[--contextMenuButtonSize:28px] leading-0 z-[calc(var(--z-default)+1)] rounded-full [grid-area:menu] ms-2 bg-[#28282880]">
                <AmpContextMenuButton />
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3">
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div className="pt-4 w-full"></div>
        </div>
      </div>

      <div className="flex pt-3 in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
        <div>
          <div className="flex justify-end items-center m-[0_var(--bodyGutter)_13px]">
            <div className="flex-1">
              <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
                <span dir="auto">Latest Release</span>
              </h2>
            </div>
          </div>

          <div>
            <div className="[--iconCircleFillBGOverride:transparent] items-center flex justify-start pb-8 ms-(--bodyGutter) w-[calc(100%-var(--bodyGutter))] min-[1000px]:w-[calc(50vw-var(--web-navigation-width,0)*2/4-50px)] min-[1260px]:w-[calc(40vw-var(--web-navigation-width,0)*2/5-44px)] min-[1580px]:w-[calc(25vw-var(--web-navigation-width,0)*2/8-35px)]">
              <div className="rounded-[7px] shadow-[0_1px_1px_rgba(0,0,0,0.01),0_2px_2px_rgba(0,0,0,0.01),0_4px_4px_rgba(0,0,0,0.02),0_8px_8px_rgba(0,0,0,0.03),0_14px_14px_rgba(0,0,0,0.03)] cursor-pointer relative [--scrimOpacity:0] hover:[--scrimOpacity:1] after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:bg-[#333333]/30 after:opacity-(--scrimOpacity,0) after:transition-opacity after:duration-100 after:ease-in after:z-1">
                <div className="rounded-[7px]">
                  <CardArtwork
                    altText={latestRelease?.attributes.name ?? ""}
                    artworkColors={{
                      bg: latestReleaseArtworkColor,
                      main: latestReleaseArtworkColor,
                    }}
                    containerClassName="contain-content min-[415px]:[--artwork-override-width:165px] min-[1000px]:[--artwork-override-width:calc(165px*var(--aspect-ratio))] min-[1000px]:[--artwork-override-height:165px]"
                    imageSrcSet={latestReleaseSrcSet}
                    sizes="(max-width:1319px) 296px,(min-width:1320px) and (max-width:1679px) 316px,316px"
                    title={latestRelease?.attributes.name ?? ""}
                    variant="cover"
                  />
                </div>

                {latestRelease && (
                  <div className="media-card-interaction rounded-[inherit] size-full opacity-(--scrimOpacity,0) absolute top-0 transition-(--global-transition) z-[calc(var(--z-default)+1)]">
                    <CardPlayButton
                      variant="cover"
                      onPlay={() => {
                        void playCatalogResource("albums", latestRelease.id);
                      }}
                    />
                    <CardContextMenu />
                  </div>
                )}
              </div>

              {latestRelease && (
                <ul className="whitespace-normal ms-5 me-5">
                  {latestReleaseDate && (
                    <li className="text-(--systemSecondary) [font:var(--subhead-emphasized)] mb-1.5">
                      {latestReleaseDate}
                    </li>
                  )}

                  <li className="items-center flex">
                    <Link
                      className="[--badgeSize:calc(var(--explicitBadgeWidth,0px)+var(--favoriteBadgeWidth,0px))] text-(--systemPrimary) [font:var(--title-3-tall)] me-1 line-clamp-2 [--explicitBadgeWidth:12px]"
                      href={albumRoute(
                        latestRelease.attributes.url,
                        latestRelease.id,
                      )}
                    >
                      {latestRelease.attributes.name}
                    </Link>

                    {latestReleaseIsExplicit && (
                      <span className="-mt-px" aria-label="Explicit">
                        <svg
                          viewBox="0 0 9 9"
                          width="9"
                          height="9"
                          className="h-(--explicitBadgeSize,11px) w-(--explicitBadgeSize,11px) fill-(--explicitFillOverride,var(--systemSecondary))"
                          aria-hidden="true"
                        >
                          <path d="M3.9 7h1.9c.4 0 .7-.2.7-.5s-.3-.4-.7-.4H4.1V4.9h1.5c.4 0 .7-.1.7-.4 0-.3-.3-.5-.7-.5H4.1V2.9h1.7c.4 0 .7-.2.7-.5 0-.2-.3-.4-.7-.4H3.9c-.6 0-.9.3-.9.7v3.7c0 .3.3.6.9.6zM1.6 0h5.8C8.5 0 9 .5 9 1.6v5.9C9 8.5 8.5 9 7.4 9H1.6C.5 9 0 8.5 0 7.4V1.6C0 .5.5 0 1.6 0z"></path>
                        </svg>
                      </span>
                    )}
                  </li>

                  {typeof latestReleaseTrackCount === "number" && (
                    <li className="text-(--systemSecondary) line-clamp-2 [font:var(--title-3-tall)]">
                      {latestReleaseTrackCount}{" "}
                      {latestReleaseTrackCount === 1 ? "song" : "songs"}
                    </li>
                  )}

                  <li className="mt-2.25">
                    <div className="flex shrink-0 items-stretch h-7">
                      <button
                        aria-label={`Add ${latestRelease.attributes.name}`}
                        className="items-center text-(--keyColor) cursor-pointer inline-flex justify-center [transition:var(--global-transition)] bg-(--systemQuinary) rounded-2xl gap-x-0.75 [font:var(--body-emphasized)] h-full min-w-16 pl-3 pr-3 me-2.5"
                        type="button"
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
                          className="fill-(--keyColor)"
                          aria-hidden="true"
                        >
                          <path
                            d="M.784 5.784h3.432v3.432c0 .43.354.784.784.784.43 0 .784-.354.784-.784V5.784h3.432a.784.784 0 1 0 0-1.568H5.784V.784A.788.788 0 0 0 5 0a.788.788 0 0 0-.784.784v3.432H.784a.784.784 0 1 0 0 1.568z"
                            fillRule="nonzero"
                          ></path>
                        </svg>

                        <span>&nbsp;Add</span>
                      </button>
                    </div>
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="min-[1000px]:flex-1 min-[1000px]:-ms-5 min-[1000px]:min-w-0">
          <div className="items-center flex justify-end m-[0_var(--bodyGutter)_13px]">
            <div className="flex-1">
              <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
                <Link
                  className="flex items-center gap-1 text-start hover:no-underline"
                  href={artistTopSongsRoute(slug, artistId)}
                >
                  <span>Top Songs</span>

                  <svg
                    className="h-(--header-title-chevron-size,12px) fill-(--header-title-chevron-color,var(--dropdownLightGrayIcon))"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 64 64"
                    aria-hidden="true"
                  >
                    <path d="M19.817 61.863c1.48 0 2.672-.515 3.702-1.546l24.243-23.63c1.352-1.385 1.996-2.737 2.028-4.443 0-1.674-.644-3.09-2.028-4.443L23.519 4.138c-1.03-.998-2.253-1.513-3.702-1.513-2.994 0-5.409 2.382-5.409 5.344 0 1.481.612 2.833 1.739 3.96l20.99 20.347-20.99 20.283c-1.127 1.126-1.739 2.478-1.739 3.96 0 2.93 2.415 5.344 5.409 5.344Z"></path>
                  </svg>
                </Link>
              </h2>
            </div>
          </div>

          <div className="pb-8">
            <section
              className="box-border p-[0_var(--shelfGridPaddingInline,var(--bodyGutter))] relative w-full z-(--z-default)"
              style={
                {
                  "--grid-max-content-xsmall": "calc(100% - var(--bodyGutter))",
                  "--grid-column-gap-xsmall": "20px",
                  "--grid-row-gap-xsmall": "0px",
                  "--grid-small": "1",
                  "--grid-column-gap-small": "20px",
                  "--grid-row-gap-small": "0px",
                  "--grid-medium": "2",
                  "--grid-column-gap-medium": "20px",
                  "--grid-row-gap-medium": "0px",
                  "--grid-large": "3",
                  "--grid-column-gap-large": "20px",
                  "--grid-row-gap-large": "0px",
                  "--grid-xlarge": "3",
                  "--grid-column-gap-xlarge": "20px",
                  "--grid-row-gap-xlarge": "0px",
                  "--grid-type": "TrackLockupsShelfNarrow",
                  "--grid-rows": "3",
                  "--standard-lockup-shadow-offset": "15px",
                } as CSSProperties
              }
            >
              <div className="box-content -me-0.5 -ms-0.5 overflow-visible pe-0.5 ps-0.5 w-full">
                <ul className="box-border grid grid-flow-col [list-style:none] m-0 overflow-x-auto overflow-y-hidden p-0 -mb-(--override-shelf-overflow-bleed-bottom,var(--overflowBleedBottom,15px)) -mt-(--override-shelf-overflow-bleed-top,var(--overflowBleedTop,15px)) overscroll-x-none pb-(--override-shelf-overflow-bleed-bottom,var(--overflowBleedBottom,15px)) pt-(--override-shelf-overflow-bleed-top,var(--overflowBleedTop,15px)) scroll-smooth [scroll-snap-type:x_mandatory] scrollbar-none items-stretch gap-x-(--grid-column-gap-xsmall) auto-cols-(--grid-max-content-xsmall,calc((100%-(var(--grid-xsmall)-1)*var(--grid-column-gap-xsmall))/var(--grid-xsmall))) grid-rows-[repeat(var(--grid-rows),max-content)] gap-y-(--grid-row-gap-xsmall) min-[1000px]:-me-(--standard-lockup-shadow-offset,15px) min-[1000px]:-ms-(--standard-lockup-shadow-offset,15px) min-[1000px]:[mask:linear-gradient(90deg,transparent_0,#000_var(--standard-lockup-shadow-offset,15px),#000_calc(100%-var(--standard-lockup-shadow-offset,15px)),transparent_100%)] min-[1000px]:pe-(--standard-lockup-shadow-offset,15px) min-[1000px]:ps-(--standard-lockup-shadow-offset,15px) min-[1000px]:w-[calc(100%+30px)] min-[1580px]:max-[1939px]:gap-x-(--grid-column-gap-large) min-[1580px]:max-[1939px]:auto-cols-(--grid-max-content-large,calc((100%-(var(--grid-large)-1)*var(--grid-column-gap-large))/var(--grid-large))) min-[1580px]:max-[1939px]:grid-rows-[repeat(var(--grid-rows),max-content)] min-[1580px]:max-[1939px]:gap-y-(--grid-row-gap-large) min-[1260px]:max-[1579px]:gap-x-(--grid-column-gap-medium) min-[1260px]:max-[1579px]:grid-cols-[repeat(auto-fill,var(--grid-max-content-medium,calc((100%-(var(--grid-medium)-1)*var(--grid-column-gap-medium))/var(--grid-medium))))] min-[1260px]:max-[1579px]:grid-rows-[repeat(var(--grid-rows),max-content)] min-[1260px]:max-[1579px]:gap-y-(--grid-row-gap-medium) min-[1000px]:max-[1259px]:gap-x-(--grid-column-gap-small) min-[1000px]:max-[1259px]:grid-cols-[repeat(auto-fill,var(--grid-max-content-small,calc((100%-(var(--grid-small)-1)*var(--grid-column-gap-small))/var(--grid-small))))] min-[1000px]:max-[1259px]:grid-rows-[repeat(var(--grid-rows),max-content)] min-[1000px]:max-[1259px]:gap-y-(--grid-row-gap-small) min-[1940px]:gap-x-(--grid-column-gap-xlarge) min-[1940px]:grid-cols-[repeat(auto-fill,var(--grid-max-content-xlarge,calc((100%-(var(--grid-xlarge)-1)*var(--grid-column-gap-xlarge))/var(--grid-xlarge))))] min-[1940px]:grid-rows-[repeat(var(--grid-rows),max-content)] min-[1940px]:gap-y-(--grid-row-gap-xlarge) in-[.is-drawer-open]:min-[1580px]:max-[1939px]:grid-cols-[repeat(auto-fill,var(--grid-max-content-large,calc((100%-(var(--grid-large)-2)*var(--grid-column-gap-large))/(var(--grid-large)-1))))] in-[.is-drawer-open]:min-[1260px]:max-[1579px]:grid-cols-[repeat(auto-fill,var(--grid-max-content-medium,calc((100%-(var(--grid-medium)-2)*var(--grid-column-gap-medium))/(var(--grid-medium)-1))))]">
                  {topSongPreview.map((song, index) => {
                    const artworkColor =
                      song.artworkBgColor ?? "var(--genericJoeColor)";
                    const songMeta = [song.album, song.releaseDate?.slice(0, 4)]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <li
                        className="contain-content -mt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) -me-(--standard-lockup-shadow-offset,15px) -mb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) -ms-(--standard-lockup-shadow-offset,15px) pe-(--standard-lockup-shadow-offset,15px) pb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) pt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) ps-(--standard-lockup-shadow-offset,15px) snap-start"
                        key={song.id}
                      >
                        <div
                          className="group items-center text-(--systemPrimary) grid grid-cols-[auto_auto_1fr_auto] pb-[7.5px] pt-[7.5px] relative w-full pe-(--trackLockupPaddingInlineEnd,14px) cursor-pointer after:[border-top:var(--keyline-border-style)] after:content-[''] after:inset-e-0 after:inset-s-0 after:absolute after:top-0 after:z-(--z-default)"
                          onClick={() =>
                            song.albumUrl && router.push(song.albumUrl)
                          }
                        >
                          <div className="rounded-[5px] relative me-3">
                            <CardArtwork
                              altText=""
                              artworkColors={{
                                bg: artworkColor,
                                main: artworkColor,
                              }}
                              containerClassName="contain-content [--artwork-override-width:calc(40px*var(--aspect-ratio))] [--artwork-override-height:40px]"
                              imageSrcSet={
                                song.thumbnailArtworkSrcSet ??
                                song.artworkSrcSet ??
                                ""
                              }
                              sizes="40px"
                              title={song.title}
                              variant="cover"
                            />

                            <div className="[--playButtonIconHoverColor:#fff] [--progress-play-background-color:hsla(0,0%,100%,.1)] transition-(--global-transition) rounded-[5px] bottom-0 inset-e-0 inset-s-0 m-auto absolute top-0 z-1 group-hover:items-center group-hover:bg-[rgba(0,0,0,.45)] group-hover:flex group-hover:h-full group-hover:inset-s-0 group-hover:justify-center group-hover:absolute group-hover:top-0 group-hover:w-full group-hover:z-(--transgray-scrim-z,var(--z-default))">
                              <div className="[--nonPlatterIconFill:var(--nonPlatterOverrideIconColor,var(--keyColor))] h-(--interactivePlayButtonSize,16px) w-(--interactivePlayButtonSize,16px)">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setQueue(songs, index);
                                  }}
                                  className="[--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] leading-0 pointer-events-auto rounded-[5px] bottom-0 inset-e-0 inset-s-0 m-auto absolute top-0 z-1 opacity-0 group-hover:opacity-100"
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

                          <ul className="[--linkHoverTextDecoration:none] items-start self-stretch flex flex-col justify-center overflow-hidden text-start ps-1 pe-1 me-2">
                            <li className="[--explicitBadgeSize:10px] items-baseline grid grid-cols-[1fr_auto_auto] [font:var(--body-tall)]">
                              <div className="-mb-1 -mt-1 overflow-hidden text-ellipsis whitespace-nowrap -ms-1 -me-1 pb-1 pt-1 pe-1 ps-1">
                                {song.title}
                              </div>

                              {song.contentRating === "explicit" && (
                                <span className="ms-1" aria-label="Explicit">
                                  <svg
                                    viewBox="0 0 9 9"
                                    width="9"
                                    height="9"
                                    className="h-(--explicitBadgeSize,auto) w-(--explicitBadgeSize,auto) fill-(--explicitFillOverride,var(--systemSecondary))"
                                    aria-hidden="true"
                                  >
                                    <path d="M3.9 7h1.9c.4 0 .7-.2.7-.5s-.3-.4-.7-.4H4.1V4.9h1.5c.4 0 .7-.1.7-.4 0-.3-.3-.5-.7-.5H4.1V2.9h1.7c.4 0 .7-.2.7-.5 0-.2-.3-.4-.7-.4H3.9c-.6 0-.9.3-.9.7v3.7c0 .3.3.6.9.6zM1.6 0h5.8C8.5 0 9 .5 9 1.6v5.9C9 8.5 8.5 9 7.4 9H1.6C.5 9 0 8.5 0 7.4V1.6C0 .5.5 0 1.6 0z"></path>
                                  </svg>
                                </span>
                              )}
                            </li>

                            {songMeta && (
                              <li className="[--linkHoverColor:inherit] [--linkHoverTextDecoration:underline] text-(--systemSecondary) [font:var(--body)] max-w-full">
                                <div className="-mb-1 -mt-1 overflow-hidden text-ellipsis whitespace-nowrap -ms-1 -me-1 pb-1 pt-1 pe-1 ps-1">
                                  <span>{songMeta}</span>
                                </div>
                              </li>
                            )}
                          </ul>

                          <div
                            className="ms-auto"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="items-center flex justify-end shrink-0 h-7 [--contextMenuEllipsisFillOverride:var(--systemSecondary)]">
                              <button className="items-center text-(--keyColor) cursor-pointer inline-flex justify-center transition-(--global-transition) h-(--add-to-library-button-width,25px) leading-0 w-0 group-hover:w-(--add-to-library-button-width,25px) me-(--addToLibraryMarginEnd,4px)">
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

                              <AmpContextMenuButton />
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3">
        <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div className="m-[0_var(--bodyGutter)_13px] items-center flex justify-end">
            <div className="flex-1">
              <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
                <span dir="auto">Albums</span>
              </h2>
            </div>
          </div>

          <div className="pb-8"></div>
        </div>
      </div>
    </>
  );
}
