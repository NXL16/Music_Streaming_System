import type { CSSProperties } from "react";

export function NewFeaturedShelf() {
  return (
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

                    {/* Thẻ <p></p> này chỉ có album và playlist là có */}
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

                    {/* Album  ko có class before:z-1  và VIDEO không có thẻ div dưới này */}
                    <div className="items-end rounded-[inherit] bottom-0 flex justify-between -mt-25 min-h-25 p-[24px_16px_16px] whitespace-normal w-full z-[calc(var(--z-default)+1)] before:[background:linear-gradient(transparent,rgba(0,0,0,.4))] before:rounded-[inherit] before:bottom-0 before:content-[''] before:inset-x-0 before:m-auto before:absolute before:top-0">
                      {/* description option */}
                      <div className="text-white line-clamp-3 flex-1 [font:var(--callout)] max-w-[85%] pe-5 pointer-events-none top-1 z-[calc(var(--z-default)+1)]">
                        Lorem, ipsum dolor sit amet consectetur adipisicing
                        elit. Ex, ut cumque.
                      </div>

                      {/* Playlist không có thẻ div này */}
                      <div className="rounded-sm ms-auto relative [--artwork-override-width:calc(60px*var(--aspect-ratio))] [--artwork-override-height:60px] after:bg-[rgba(51,51,51,.3)] after:rounded-[inherit] after:size-full after:left-0 after:opacity-0 after:absolute after:top-0 after:[transition:opacity_.1s_ease-in] after:z-1">
                        {/* Playlist không có thẻ div này */}
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

                        {/* Chỉ có thẻ div này riêng playlist loại các class "items-center bottom-0 flex inset-x-0 justify-center m-auto pointer-events-none top-0 z-2" này và thay vào đó là class "bottom-3.75 inset-e-3.75"*/}
                        <div className="items-center bottom-0 flex inset-x-0 justify-center m-auto pointer-events-none top-0 z-2 opacity-0 absolute [transition:var(--global-transition)] group-hover:opacity-100 group-hover:z-[calc(var(--z-default)+1)]">
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
                        Lorem, ipsum dolor sit amet consectetur adipisicing
                        elit. Ex, ut cumque.
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
                      Say hello to our first-ever live venue, in the heart of
                      London.
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
  );
}
