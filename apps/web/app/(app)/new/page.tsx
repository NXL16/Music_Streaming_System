import AmpContextMenuButton from "@/components/custom-elements/AmpContextMenuButton";
import { ExplicitBadgeIcon } from "@/components/icons/explicit-badge-icon";
import CardArtwork from "@/components/media/common/card-artwork";
import { AddSongToLibraryButton } from "@/components/songs/add-song-to-library-button";
import { PlaybackWaveform } from "@/components/songs/playback-waveform";
import { formatReleaseYear } from "@/lib/format/release-date";
import Link from "next/link";
import { CSSProperties } from "react";

export default function NewPage() {
  return (
    <>
      <div className="grid items-end grid-cols-[1fr_auto] me-(--bodyGutter) ms-(--bodyGutter) pb-[0.05px] pt-8">
        <h1 className="text-(--systemPrimary) [font:var(--header-emphasized)] col-1 row-1">
          New
        </h1>
      </div>

      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-7">
        <div className="">
          <div className="pb-8">
            <section
              className="box-border p-[0_var(--shelfGridPaddingInline,var(--bodyGutter))]"
              style={
                {
                  "--grid-max-content-xsmall": "298px",
                  "--grid-column-gap-xsmall": "10px",
                  "--grid-row-gap-xsmall": "24px",
                  "--grid-small": "2",
                  "--grid-column-gap-small": "20px",
                  "--grid-row-gap-small": "24px",
                  "--grid-medium": "2",
                  "--grid-column-gap-medium": "20px",
                  "--grid-row-gap-medium": "24px",
                  "--grid-large": 3,
                  "--grid-column-gap-large": "20px",
                  "--grid-row-gap-large": "24px",
                  "--grid-xlarge": 3,
                  "--grid-column-gap-xlarge": "20px",
                  "--grid-row-gap-xlarge": "24px",
                  "--grid-type": "A",
                  "--grid-rows": "1",
                  "--standard-lockup-shadow-offset": "15px",
                } as CSSProperties
              }
            >
              <div className="box-border -mx-0.5 overflow-visible px-0.5 w-full">
                <ul className="shelf-grid__list">
                  {/* NEW ALBUM */}
                  <li className="contain-content -mt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) -me-(--standard-lockup-shadow-offset,15px) -mb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) -ms-(--standard-lockup-shadow-offset,15px) pe-(--standard-lockup-shadow-offset,15px) pb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) pt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) ps-(--standard-lockup-shadow-offset,15px) snap-start -scroll-ms-(--standard-lockup-shadow-offset)">
                    <div>
                      <div>
                        <div className="[--linkHoverTextDecoration:none] [--playButtonCircleHoverColor:var(--keyColor)] [--iconCircleFillBGOverride:transparent] relative group">
                          <a
                            href="#"
                            className="text-transparent block size-full absolute z-[calc(var(--z-default)+1)]"
                          >
                            Mắt Nhắm Mắt Mở (Studio Live Session) - EP
                          </a>

                          <div className="mb-3.75 min-h-15">
                            <p className="text-(--systemSecondary) [font:var(--subhead-emphasized)] m-[1px_0_2px] line-clamp-1">
                              NEW LIVE ALBUM
                            </p>
                            <h2 className="text-(--systemPrimary) [font:var(--title-2)] m-0 p-0 [text-align:match-parent] line-clamp-1">
                              Mắt Nhắm Mắt Mở (Studio Live Session) - EP
                            </h2>
                            <p className="text-(--systemSecondary) [font:var(--title-2)] line-clamp-1">
                              HIEUTHUHAI
                            </p>
                          </div>

                          <div className="relative rounded-(--global-border-radius-large,10px) after:bg-[rgba(51,51,51,.3)] after:rounded-[inherit]  after:size-full after:left-0 after:opacity-0 after:absolute after:top-0 after:[transition:opacity_.1s_ease-in] after:z-1 group-hover:after:opacity-[1]">
                            <div
                              className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) overflow-hidden w-full z-(--z-default) min-[1000px]:[anchor-name:--shelf-first-artwork] after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset)  after:block after:h-0 after:max-h-full after:max-w-full after:min-h-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,.1) after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] dark:after:opacity-(--containerInnerStrokeAlpha,.25)"
                              style={
                                {
                                  "--artwork-bg-color": "#1f150c",
                                  "--aspect-ratio": "1.7435897435897436",
                                  "--placeholder-bg-color": "transparent",
                                } as CSSProperties
                              }
                            >
                              <picture>
                                <source
                                  sizes="(max-width:1319px) 300px,(min-width:1320px) and (max-width:1679px) 480px,530px"
                                  srcSet="https://is1-ssl.mzstatic.com/image/thumb/Features/v4/0c/f4/57/0cf457b0-20d2-7623-9647-63de01f356cf/1326b3c5-138f-4d76-a410-65b35489bab8.png/300x172sr.webp 300w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/0c/f4/57/0cf457b0-20d2-7623-9647-63de01f356cf/1326b3c5-138f-4d76-a410-65b35489bab8.png/480x275sr.webp 480w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/0c/f4/57/0cf457b0-20d2-7623-9647-63de01f356cf/1326b3c5-138f-4d76-a410-65b35489bab8.png/530x304sr.webp 530w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/0c/f4/57/0cf457b0-20d2-7623-9647-63de01f356cf/1326b3c5-138f-4d76-a410-65b35489bab8.png/600x344sr.webp 600w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/0c/f4/57/0cf457b0-20d2-7623-9647-63de01f356cf/1326b3c5-138f-4d76-a410-65b35489bab8.png/960x550sr.webp 960w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/0c/f4/57/0cf457b0-20d2-7623-9647-63de01f356cf/1326b3c5-138f-4d76-a410-65b35489bab8.png/1060x608sr.webp 1060w"
                                />
                                <img
                                  width="530"
                                  height="303"
                                  src="/assets/artwork/1x1.gif"
                                  alt="Mắt Nhắm Mắt Mở (Studio Live Session) - EP"
                                  style={{ opacity: 1 }}
                                  className="rounded-[inherit] [transition:var(--global-transition,opacity_.1s_ease-in)] block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%)"
                                />
                              </picture>
                            </div>

                            <div className="items-end rounded-[inherit] bottom-0 flex justify-between -mt-25 min-h-25 p-[24px_16px_16px] whitespace-normal w-full z-[calc(var(--z-default)+1)] before:[background:linear-gradient(transparent,rgba(0,0,0,.4))] before:rounded-[inherit] before:bottom-0 before:content-[''] before:inset-x-0 before:m-auto before:absolute before:top-0">
                              {/* description option */}
                              <div className="text-white line-clamp-3 flex-1 [font:var(--callout)] max-w-[85%] pe-5 pointer-events-none top-1 z-[calc(var(--z-default)+1)]">
                                Lorem, ipsum dolor sit amet consectetur
                                adipisicing elit. Ex, ut cumque.
                              </div>

                              <div className="rounded-sm ms-auto relative [--artwork-override-width:calc(60px*var(--aspect-ratio))] [--artwork-override-height:60px] after:bg-[rgba(51,51,51,.3)] after:rounded-[inherit] after:size-full after:left-0 after:opacity-0 after:absolute after:top-0 after:[transition:opacity_.1s_ease-in] after:z-1">
                                <div
                                  className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) overflow-hidden w-full z-(--z-default) min-[1000px]:[anchor-name:--shelf-first-artwork] after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset)  after:block after:h-0 after:max-h-full after:max-w-full after:min-h-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,.1) after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] dark:after:opacity-(--containerInnerStrokeAlpha,.25)"
                                  style={
                                    {
                                      "--artwork-bg-color": "#180f07",
                                      "--aspect-ratio": "1",
                                      "--placeholder-bg-color": "transparent",
                                    } as CSSProperties
                                  }
                                >
                                  <picture>
                                    <source
                                      sizes="60px"
                                      srcSet="https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/f9/c4/8a/f9c48a79-ac83-7cb9-83bb-236a6bfcd419/26UMGIM53679.rgb.jpg/60x60cc.webp 60w,https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/f9/c4/8a/f9c48a79-ac83-7cb9-83bb-236a6bfcd419/26UMGIM53679.rgb.jpg/120x120cc.webp 120w"
                                    />
                                    <img
                                      width="60"
                                      height="60"
                                      decoding="async"
                                      fetchPriority="auto"
                                      src="/assets/artwork/1x1.gif"
                                      alt="Mắt Nhắm Mắt Mở (Studio Live Session) - EP"
                                      style={{ opacity: 1 }}
                                      className="rounded-[inherit] [transition:var(--global-transition,opacity_.1s_ease-in)] block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%)"
                                    />
                                  </picture>
                                </div>

                                <div className="[transition:var(--global-transition)] opacity-0 items-center bottom-0 flex inset-x-0 justify-center m-auto pointer-events-none absolute top-0 z-2 group-hover:opacity-100 group-hover:z-[calc(var(--z-default)+1)]">
                                  <button
                                    type="button"
                                    className="media-card-play-button [--iconCircleFillBG:var(--iconCircleFillBGOverride,var(--systemQuaternary))] [--iconFillArrow:var(--playButtonIconColor,#fff)] rounded-[50%] [--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] leading-0 pointer-events-auto relative z-(--z-default) block hover:[--iconCircleFillBG:var(--keyColor)] hover:[--iconFillArrow:#fff]"
                                  >
                                    <svg
                                      aria-hidden="true"
                                      className="inline-block h-7.5 w-7.5 rounded-[50%] bg-(--systemStandardThinMaterialSover) backdrop-saturate-180 backdrop-blur-[60px] hover:bg-transparent hover:backdrop-filter-none"
                                      data-icon-state="play"
                                    >
                                      <use href="#play-circle-fill"></use>
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>

                  {/* NEW PLAYLIST */}
                  <li className="contain-content -mt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) -me-(--standard-lockup-shadow-offset,15px) -mb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) -ms-(--standard-lockup-shadow-offset,15px) pe-(--standard-lockup-shadow-offset,15px) pb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) pt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) ps-(--standard-lockup-shadow-offset,15px) snap-start -scroll-ms-(--standard-lockup-shadow-offset)">
                    <div>
                      <div>
                        <div className="[--linkHoverTextDecoration:none] [--playButtonCircleHoverColor:var(--keyColor)] [--iconCircleFillBGOverride:transparent] relative group">
                          <a
                            href="#"
                            className="text-transparent block size-full absolute z-[calc(var(--z-default)+1)]"
                          >
                            Mắt Nhắm Mắt Mở (Studio Live Session) - EP
                          </a>

                          <div className="mb-3.75 min-h-15">
                            <p className="text-(--systemSecondary) [font:var(--subhead-emphasized)] m-[1px_0_2px] line-clamp-1">
                              HOT PLAYLIST
                            </p>
                            <h2 className="text-(--systemPrimary) [font:var(--title-2)] m-0 p-0 [text-align:match-parent] line-clamp-1">
                              Viral Viet Pop
                            </h2>
                            <p className="text-(--systemSecondary) [font:var(--title-2)] line-clamp-1">
                              Vietnamese Music
                            </p>
                          </div>

                          <div className="relative rounded-(--global-border-radius-large,10px) after:bg-[rgba(51,51,51,.3)] after:rounded-[inherit]  after:size-full after:left-0 after:opacity-0 after:absolute after:top-0 after:[transition:opacity_.1s_ease-in] after:z-1 group-hover:after:opacity-[1]">
                            <div
                              className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) overflow-hidden w-full z-(--z-default) min-[1000px]:[anchor-name:--shelf-first-artwork] after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset)  after:block after:h-0 after:max-h-full after:max-w-full after:min-h-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,.1) after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] dark:after:opacity-(--containerInnerStrokeAlpha,.25)"
                              style={
                                {
                                  "--artwork-bg-color": "#1f150c",
                                  "--aspect-ratio": "1.7435897435897436",
                                  "--placeholder-bg-color": "transparent",
                                } as CSSProperties
                              }
                            >
                              <picture>
                                <source
                                  sizes="(max-width:1319px) 300px,(min-width:1320px) and (max-width:1679px) 480px,530px"
                                  srcSet="https://is1-ssl.mzstatic.com/image/thumb/Features/v4/30/9c/c3/309cc312-cf3c-4271-e7e6-80459a275276/900092ea-8444-46a4-9669-4eb190ffd117.png/300x172sr.webp 300w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/30/9c/c3/309cc312-cf3c-4271-e7e6-80459a275276/900092ea-8444-46a4-9669-4eb190ffd117.png/480x275sr.webp 480w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/30/9c/c3/309cc312-cf3c-4271-e7e6-80459a275276/900092ea-8444-46a4-9669-4eb190ffd117.png/530x304sr.webp 530w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/30/9c/c3/309cc312-cf3c-4271-e7e6-80459a275276/900092ea-8444-46a4-9669-4eb190ffd117.png/600x344sr.webp 600w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/30/9c/c3/309cc312-cf3c-4271-e7e6-80459a275276/900092ea-8444-46a4-9669-4eb190ffd117.png/960x550sr.webp 960w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/30/9c/c3/309cc312-cf3c-4271-e7e6-80459a275276/900092ea-8444-46a4-9669-4eb190ffd117.png/1060x608sr.webp 1060w"
                                />
                                <img
                                  width="530"
                                  height="303"
                                  src="/assets/artwork/1x1.gif"
                                  alt="Mắt Nhắm Mắt Mở (Studio Live Session) - EP"
                                  style={{ opacity: 1 }}
                                  className="rounded-[inherit] [transition:var(--global-transition,opacity_.1s_ease-in)] block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%)"
                                />
                              </picture>
                            </div>

                            <div className="items-end rounded-[inherit] bottom-0 flex justify-between -mt-25 min-h-25 p-[24px_16px_16px] whitespace-normal w-full z-[calc(var(--z-default)+1)] before:bg-[linear-gradient(transparent,rgba(0,0,0,.4))] before:rounded-[inherit] before:bottom-0 before:content-[''] before:inset-x-0 before:m-auto before:absolute before:top-0 before:z-1">
                              {/* description option */}
                              <div className="text-white line-clamp-3 flex-1 [font:var(--callout)] max-w-[85%] pe-5 pointer-events-none top-1 z-[calc(var(--z-default)+1)]">
                                Lorem, ipsum dolor sit amet consectetur
                                adipisicing elit. Ex, ut cumque.
                              </div>

                              {/* <div className="rounded-sm ms-auto relative [--artwork-override-width:calc(60px*var(--aspect-ratio))] [--artwork-override-height:60px] after:bg-[rgba(51,51,51,.3)] after:rounded-[inherit]  after:size-full after:left-0 after:opacity-0 after:absolute after:top-0 after:[transition:opacity_.1s_ease-in] after:z-1"> */}
                              {/* <div
                                  className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) overflow-hidden w-full z-(--z-default) min-[1000px]:[anchor-name:--shelf-first-artwork] after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset)  after:block after:h-0 after:max-h-full after:max-w-full after:min-h-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,.1) after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] dark:after:opacity-(--containerInnerStrokeAlpha,.25)"
                                  style={
                                    {
                                      "--artwork-bg-color": "#180f07",
                                      "--aspect-ratio": "1",
                                      "--placeholder-bg-color": "transparent",
                                    } as CSSProperties
                                  }
                                >
                                  <picture>
                                    <source
                                      sizes="60px"
                                      srcSet="https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/3c/4f/ef/3c4fef3e-66d6-6592-e7ce-c02ff3bfe780/823375332534_Cover.jpg/60x60cc.webp 60w,https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/3c/4f/ef/3c4fef3e-66d6-6592-e7ce-c02ff3bfe780/823375332534_Cover.jpg/120x120cc.webp 120w"
                                    />
                                    <img
                                      width="60"
                                      height="60"
                                      decoding="async"
                                      fetchPriority="auto"
                                      src="/assets/artwork/1x1.gif"
                                      alt="Mắt Nhắm Mắt Mở (Studio Live Session) - EP"
                                      style={{ opacity: 1 }}
                                      className="rounded-[inherit] [transition:var(--global-transition,opacity_.1s_ease-in)] block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%)"
                                    />
                                  </picture>
                                </div> */}

                              <div className="bottom-3.75 inset-e-3.75 opacity-0 absolute [transition:var(--global-transition)] group-hover:opacity-100 group-hover:z-[calc(var(--z-default)+1)]">
                                <button
                                  type="button"
                                  className="media-card-play-button [--iconCircleFillBG:var(--iconCircleFillBGOverride,var(--systemQuaternary))] [--iconFillArrow:var(--playButtonIconColor,#fff)] rounded-[50%] [--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] leading-0 pointer-events-auto relative z-(--z-default) block hover:[--iconCircleFillBG:var(--keyColor)] hover:[--iconFillArrow:#fff]"
                                >
                                  <svg
                                    aria-hidden="true"
                                    className="inline-block h-7.5 w-7.5 rounded-[50%] bg-(--systemStandardThinMaterialSover) backdrop-saturate-180 backdrop-blur-[60px] hover:bg-transparent hover:backdrop-filter-none"
                                    data-icon-state="play"
                                  >
                                    <use href="#play-circle-fill"></use>
                                  </svg>
                                </button>
                              </div>
                              {/* </div> */}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>

                  {/* NEW VIDEO */}
                  <li className="contain-content -mt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) -me-(--standard-lockup-shadow-offset,15px) -mb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) -ms-(--standard-lockup-shadow-offset,15px) pe-(--standard-lockup-shadow-offset,15px) pb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) pt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) ps-(--standard-lockup-shadow-offset,15px) snap-start -scroll-ms-(--standard-lockup-shadow-offset)">
                    <div>
                      <div>
                        <div className="[--linkHoverTextDecoration:none] [--playButtonCircleHoverColor:var(--keyColor)] [--iconCircleFillBGOverride:transparent] relative group">
                          <a
                            href="#"
                            className="text-transparent block size-full absolute z-[calc(var(--z-default)+1)]"
                          >
                            Mắt Nhắm Mắt Mở (Studio Live Session) - EP
                          </a>

                          <div className="mb-3.75 min-h-15">
                            <p className="text-(--systemSecondary) [font:var(--subhead-emphasized)] m-[1px_0_2px] line-clamp-1">
                              WATCH NOW
                            </p>
                            <h2 className="text-(--systemPrimary) [font:var(--title-2)] m-0 p-0 [text-align:match-parent] line-clamp-2">
                              Say hello to our first-ever live venue, in the
                              heart of London.
                            </h2>
                            {/* <p className="text-(--systemSecondary) [font:var(--title-2)] line-clamp-1">
                              SOMEONE
                            </p> */}
                          </div>

                          <div className="relative rounded-(--global-border-radius-large,10px) after:bg-[rgba(51,51,51,.3)] after:rounded-[inherit]  after:size-full after:left-0 after:opacity-0 after:absolute after:top-0 after:[transition:opacity_.1s_ease-in] after:z-1 group-hover:after:opacity-[1]">
                            <div
                              className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) overflow-hidden w-full z-(--z-default) min-[1000px]:[anchor-name:--shelf-first-artwork] after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset)  after:block after:h-0 after:max-h-full after:max-w-full after:min-h-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,.1) after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] dark:after:opacity-(--containerInnerStrokeAlpha,.25)"
                              style={
                                {
                                  "--artwork-bg-color": "#1f150c",
                                  "--aspect-ratio": "1.7435897435897436",
                                  "--placeholder-bg-color": "transparent",
                                } as CSSProperties
                              }
                            >
                              <picture>
                                <source
                                  sizes="(max-width:1319px) 300px,(min-width:1320px) and (max-width:1679px) 480px,530px"
                                  srcSet="https://is1-ssl.mzstatic.com/image/thumb/Features/v4/30/9c/c3/309cc312-cf3c-4271-e7e6-80459a275276/900092ea-8444-46a4-9669-4eb190ffd117.png/300x172sr.webp 300w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/30/9c/c3/309cc312-cf3c-4271-e7e6-80459a275276/900092ea-8444-46a4-9669-4eb190ffd117.png/480x275sr.webp 480w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/30/9c/c3/309cc312-cf3c-4271-e7e6-80459a275276/900092ea-8444-46a4-9669-4eb190ffd117.png/530x304sr.webp 530w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/30/9c/c3/309cc312-cf3c-4271-e7e6-80459a275276/900092ea-8444-46a4-9669-4eb190ffd117.png/600x344sr.webp 600w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/30/9c/c3/309cc312-cf3c-4271-e7e6-80459a275276/900092ea-8444-46a4-9669-4eb190ffd117.png/960x550sr.webp 960w,https://is1-ssl.mzstatic.com/image/thumb/Features/v4/30/9c/c3/309cc312-cf3c-4271-e7e6-80459a275276/900092ea-8444-46a4-9669-4eb190ffd117.png/1060x608sr.webp 1060w"
                                />
                                <img
                                  width="530"
                                  height="303"
                                  src="/assets/artwork/1x1.gif"
                                  alt="Mắt Nhắm Mắt Mở (Studio Live Session) - EP"
                                  style={{ opacity: 1 }}
                                  className="rounded-[inherit] [transition:var(--global-transition,opacity_.1s_ease-in)] block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%)"
                                />
                              </picture>
                            </div>

                            {/* <div className="items-end rounded-[inherit] bottom-0 flex justify-between -mt-25 min-h-25 p-[24px_16px_16px] whitespace-normal w-full z-[calc(var(--z-default)+1)] before:bg-[linear-gradient(transparent,rgba(0,0,0,.4))] before:rounded-[inherit] before:bottom-0 before:content-[''] before:inset-x-0 before:m-auto before:absolute before:top-0 before:z-1">
                              <div className="rounded-sm ms-auto relative [--artwork-override-width:calc(60px*var(--aspect-ratio))] [--artwork-override-height:60px] after:bg-[rgba(51,51,51,.3)] after:rounded-[inherit]  after:size-full after:left-0 after:opacity-0 after:absolute after:top-0 after:[transition:opacity_.1s_ease-in] after:z-1">
                                <div
                                  className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) overflow-hidden w-full z-(--z-default) min-[1000px]:[anchor-name:--shelf-first-artwork] after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset)  after:block after:h-0 after:max-h-full after:max-w-full after:min-h-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,.1) after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] dark:after:opacity-(--containerInnerStrokeAlpha,.25)"
                                  style={
                                    {
                                      "--artwork-bg-color": "#180f07",
                                      "--aspect-ratio": "1",
                                      "--placeholder-bg-color": "transparent",
                                    } as CSSProperties
                                  }
                                >
                                  <picture>
                                    <source
                                      sizes="60px"
                                      srcSet="https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/3c/4f/ef/3c4fef3e-66d6-6592-e7ce-c02ff3bfe780/823375332534_Cover.jpg/60x60cc.webp 60w,https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/3c/4f/ef/3c4fef3e-66d6-6592-e7ce-c02ff3bfe780/823375332534_Cover.jpg/120x120cc.webp 120w"
                                    />
                                    <img
                                      width="60"
                                      height="60"
                                      decoding="async"
                                      fetchPriority="auto"
                                      src="/assets/artwork/1x1.gif"
                                      alt="Mắt Nhắm Mắt Mở (Studio Live Session) - EP"
                                      style={{ opacity: 1 }}
                                      className="rounded-[inherit] [transition:var(--global-transition,opacity_.1s_ease-in)] block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%)"
                                    />
                                  </picture>
                                </div>

                                <div className="[transition:var(--global-transition)] opacity-0 items-center bottom-0 flex inset-x-0 justify-center m-auto pointer-events-none absolute top-0 z-2 group-hover:opacity-100 group-hover:z-[calc(var(--z-default)+1)]">
                                  <button
                                    type="button"
                                    className="media-card-play-button [--iconCircleFillBG:var(--iconCircleFillBGOverride,var(--systemQuaternary))] [--iconFillArrow:var(--playButtonIconColor,#fff)] rounded-[50%] [--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] leading-0 pointer-events-auto relative z-(--z-default) block hover:[--iconCircleFillBG:var(--keyColor)] hover:[--iconFillArrow:#fff]"
                                  >
                                    <svg
                                      aria-hidden="true"
                                      className="inline-block h-7.5 w-7.5 rounded-[50%] bg-(--systemStandardThinMaterialSover) backdrop-saturate-180 backdrop-blur-[60px] hover:bg-transparent hover:backdrop-filter-none"
                                      data-icon-state="play"
                                    >
                                      <use href="#play-circle-fill"></use>
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div> */}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3">
        <div className="">
          <div className="items-center flex justify-end m-[0_var(--bodyGutter)_13px]">
            <div className="flex-1">
              <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
                <Link
                  className="flex items-center gap-1 text-start hover:no-underline"
                  href="#"
                >
                  <span>Add These Viral Hits</span>

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
              className="box-border p-[0_var(--shelfGridPaddingInline,var(--bodyGutter))] relative w-full z-(--z-default) max-[999px]:pe-0 max-[999px]:ps-0"
              style={
                {
                  "--grid-max-content-xsmall": "270px",
                  "--grid-column-gap-xsmall": "10px",
                  "--grid-row-gap-xsmall": "0px",
                  "--grid-small": "2",
                  "--grid-column-gap-small": "20px",
                  "--grid-row-gap-small": "0px",
                  "--grid-medium": "3",
                  "--grid-column-gap-medium": "20px",
                  "--grid-row-gap-medium": "0px",
                  "--grid-large": "4",
                  "--grid-column-gap-large": "20px",
                  "--grid-row-gap-large": "0px",
                  "--grid-xlarge": "4",
                  "--grid-column-gap-xlarge": "20px",
                  "--grid-row-gap-xlarge": "0px",
                  "--grid-type": "TrackLockupsShelf",
                  "--grid-rows": "4",
                  "--standard-lockup-shadow-offset": "15px",
                } as CSSProperties
              }
            >
              <div className="top-song box-content -me-0.5 -ms-0.5 overflow-visible pe-0.5 ps-0.5 w-full">
                {/* <ul
                  className="shelf-grid__list--artist"
                  onClickCapture={(event) => {
                    if (!topSongsDraggedRef.current) return;
                    topSongsDraggedRef.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType !== "mouse" || event.button !== 0)
                      return;
                    topSongsDragRef.current = {
                      startX: event.clientX,
                      scrollLeft: event.currentTarget.scrollLeft,
                    };
                    topSongsDragElementRef.current = event.currentTarget;
                    topSongsDraggedRef.current = false;
                  }}
                  onPointerMove={(event) => {
                    const drag = topSongsDragRef.current;
                    if (!drag) return;
                    const latestEvent =
                      event.nativeEvent.getCoalescedEvents?.().at(-1) ??
                      event.nativeEvent;
                    const distance = latestEvent.clientX - drag.startX;
                    if (!topSongsDraggedRef.current && Math.abs(distance) < 6) {
                      return;
                    }
                    if (!topSongsDraggedRef.current) {
                      topSongsDraggedRef.current = true;
                      event.currentTarget.dataset.dragging = "true";
                      event.currentTarget.style.scrollBehavior = "auto";
                      event.currentTarget.setPointerCapture(event.pointerId);
                      event.currentTarget.scrollLeft =
                        drag.scrollLeft - distance;
                      return;
                    }
                    event.preventDefault();
                    topSongsPendingScrollRef.current =
                      drag.scrollLeft - distance;
                    if (topSongsDragFrameRef.current !== undefined) return;
                    topSongsDragFrameRef.current = requestAnimationFrame(() => {
                      const scrollLeft = topSongsPendingScrollRef.current;
                      const container = topSongsDragElementRef.current;
                      topSongsDragFrameRef.current = undefined;
                      topSongsPendingScrollRef.current = undefined;
                      if (container && scrollLeft !== undefined) {
                        container.scrollLeft = scrollLeft;
                      }
                    });
                  }}
                  onPointerUp={(event) => {
                    if (topSongsDragFrameRef.current !== undefined) {
                      cancelAnimationFrame(topSongsDragFrameRef.current);
                      topSongsDragFrameRef.current = undefined;
                    }
                    if (topSongsPendingScrollRef.current !== undefined) {
                      event.currentTarget.scrollLeft =
                        topSongsPendingScrollRef.current;
                      topSongsPendingScrollRef.current = undefined;
                    }
                    if (
                      event.currentTarget.hasPointerCapture(event.pointerId)
                    ) {
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    }
                    event.currentTarget.style.removeProperty("scroll-behavior");
                    delete event.currentTarget.dataset.dragging;
                    topSongsDragRef.current = undefined;
                    topSongsDragElementRef.current = null;
                  }}
                  onPointerCancel={(event) => {
                    if (topSongsDragFrameRef.current !== undefined) {
                      cancelAnimationFrame(topSongsDragFrameRef.current);
                      topSongsDragFrameRef.current = undefined;
                    }
                    topSongsPendingScrollRef.current = undefined;
                    if (
                      event.currentTarget.hasPointerCapture(event.pointerId)
                    ) {
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    }
                    event.currentTarget.style.removeProperty("scroll-behavior");
                    delete event.currentTarget.dataset.dragging;
                    topSongsDragRef.current = undefined;
                    topSongsDragElementRef.current = null;
                  }}
                  onDragStart={(event) => {
                    if (topSongsDragRef.current) event.preventDefault();
                  }}
                >
                  {topSongPreview.map((song, index) => {
                    const artworkColor =
                      song.artworkBgColor ?? "var(--genericJoeColor)";
                    const isCurrentTrack = currentSong?.id === song.id;
                    const isTrackPlaying = isCurrentTrack && playing;

                    const songMeta = [
                      song.album,
                      formatReleaseYear(song.releaseDate),
                    ]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <li
                        className="contain-content -mt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) -me-(--standard-lockup-shadow-offset,15px) -mb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) -ms-(--standard-lockup-shadow-offset,15px) pe-(--standard-lockup-shadow-offset,15px) pb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) pt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) ps-(--standard-lockup-shadow-offset,15px) snap-start"
                        key={song.id}
                      >
                        <div
                          className="group items-center text-(--systemPrimary) grid grid-cols-[auto_auto_1fr_auto] pb-[7.5px] pt-[7.5px] relative w-full pe-(--trackLockupPaddingInlineEnd,14px) cursor-pointer after:[border-top:var(--keyline-border-style)] after:inset-e-0 after:inset-s-0 after:absolute after:top-0 after:z-(--z-default)"
                          onClick={() => {
                            if (!song.albumUrl) return;
                            router.push(
                              `${song.albumUrl}?trackId=${encodeURIComponent(song.id)}`,
                            );
                          }}
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

                            <div
                              className={`[--playButtonIconHoverColor:#fff] [--progress-play-background-color:hsla(0,0%,100%,.1)] transition-(--global-transition) rounded-[5px] bottom-0 inset-e-0 inset-s-0 m-auto absolute top-0 z-1 ${
                                isCurrentTrack
                                  ? "items-center bg-[rgba(0,0,0,.45)] flex h-full justify-center w-full"
                                  : "group-hover:items-center group-hover:bg-[rgba(0,0,0,.45)] group-hover:flex group-hover:h-full group-hover:justify-center group-hover:w-full"
                              }`}
                            >
                              <div className="[--nonPlatterIconFill:var(--nonPlatterOverrideIconColor,var(--keyColor))] h-(--interactivePlayButtonSize,16px) w-(--interactivePlayButtonSize,16px)">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (isCurrentTrack) {
                                      togglePlayback();
                                      return;
                                    }

                                    setQueue(songs, index);
                                  }}
                                  className={`[--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] leading-0 pointer-events-auto rounded-[5px] bottom-0 inset-e-0 inset-s-0 m-auto absolute top-0 z-1 ${
                                    isCurrentTrack
                                      ? "opacity-100"
                                      : "opacity-0 group-hover:opacity-100"
                                  }`}
                                >
                                  {isCurrentTrack ? (
                                    <div className="bottom-0 inset-x-0 m-auto absolute top-0 z-1 h-3.75 pointer-events-none w-full">
                                      <PlaybackWaveform
                                        isPlaying={isTrackPlaying}
                                        seed={song.id}
                                      />

                                      <div className="bottom-0 inset-x-0 m-auto opacity-0 absolute top-0 z-1 group-hover:opacity-100">
                                        {isTrackPlaying ? (
                                          <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 16 16"
                                            xmlns="http://www.w3.org/2000/svg"
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            strokeLinejoin="round"
                                            strokeMiterlimit="2"
                                            className="inline-block align-bottom"
                                            aria-hidden="true"
                                          >
                                            <path
                                              fill="var(--nonPlatterIconFill, var(--keyColor, black))"
                                              d="M9.918.464h2.672a.89.89 0 0 1 .89.89v13.291a.89.89 0 0 1-.89.891H9.918a.89.89 0 0 1-.89-.89V1.354a.89.89 0 0 1 .89-.891zm-6.371 0h2.398c.567 0 1.027.46 1.027 1.028v13.016c0 .568-.46 1.028-1.027 1.028H3.547c-.567 0-1.028-.46-1.028-1.028V1.492c0-.568.46-1.028 1.028-1.028z"
                                              fillRule="nonzero"
                                            ></path>
                                          </svg>
                                        ) : (
                                          <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 16 16"
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="inline-block align-bottom"
                                            aria-hidden="true"
                                          >
                                            <path
                                              fill="var(--nonPlatterIconFill, var(--keyColor, black))"
                                              d="m4.4 15.14 10.386-6.096c.842-.459.794-1.64 0-2.097L4.401.85c-.87-.53-2-.12-2 .82v12.625c0 .966 1.06 1.4 2 .844z"
                                            ></path>
                                          </svg>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 16 16"
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="pointer-events-none inline-block h-(--playButtonSize,16px) w-(--playButtonSize,16px) align-bottom"
                                      aria-hidden="true"
                                    >
                                      <path
                                        className="fill-(--nonPlatterIconFill,var(--keyColor,black))"
                                        d="m4.4 15.14 10.386-6.096c.842-.459.794-1.64 0-2.097L4.401.85c-.87-.53-2-.12-2 .82v12.625c0 .966 1.06 1.4 2 .844z"
                                      ></path>
                                    </svg>
                                  )}
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
                                  <ExplicitBadgeIcon />
                                </span>
                              )}
                            </li>

                            {songMeta && (
                              <li className="[--linkHoverColor:inherit] [--linkHoverTextDecoration:underline] text-(--systemSecondary) [font:var(--callout)] max-w-full">
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
                              <AddSongToLibraryButton
                                songId={song.id}
                                title={song.title}
                                artist={song.artist}
                                artworkUrl={song.artworkUrl}
                                sourceAlbumId={song.albumId}
                                showOnParentHover
                              />

                              <AmpContextMenuButton
                                id={`song-${song.releaseTrackId ?? song.id}`}
                                context={{
                                  kind: "song",
                                  songId: song.id,
                                  releaseTrackId: song.releaseTrackId,
                                  title: song.title,
                                  subtitle: song.artist,
                                  artworkUrl: song.artworkUrl,
                                  sourceAlbumId: song.albumId,
                                  userId,
                                  isFavorite: favoriteSongIds.has(song.id),
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul> */}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
