import type { CSSProperties } from "react";
import Link from "next/link";
import ResponsiveArtwork from "@/components/media/common/responsive-artwork";
import { ExplicitBadgeIcon } from "@/components/icons/explicit-badge-icon";
import { PlaybackWaveform } from "@/components/songs/playback-waveform";
import type { SidebarItem, SidebarNavigationItem } from "./sidebar-types";
import { usePinnedSidebarPlayback } from "./use-pinned-sidebar-playback";

type SidebarItemContentProps = {
  item: SidebarItem;
  isSelected: boolean;
  isPinItem?: boolean;
  onPinNavigate?: () => void;
};

export function SidebarItemContent(props: SidebarItemContentProps) {
  const { item, isPinItem } = props;

  if (isPinItem && item.variant !== "pin") {
    return (
      <PinnedSidebarItemContent
        item={item}
        isSelected={props.isSelected}
        onPinNavigate={props.onPinNavigate}
      />
    );
  }

  return <StandardSidebarItemContent {...props} />;
}

function StandardSidebarItemContent({
  item,
  isSelected,
}: SidebarItemContentProps) {
  return (
    <div
      className={`items-center rounded-[inherit] flex gap-2 size-full in-[.app-container]:gap-1.5 min-[484px]:in-[.app-container]:gap-0.5 ${isSelected ? "text-(--keyColor)" : "text-(--navigation-item-text-color,var(--systemPrimary))"}`}
    >
      <span
        className={`max-[483px]:basis-(--navigation-item-icon-size,28px) flex-[0_0] basis-(--navigation-item-icon-size,32px) leading-0 in-[.app-container]:mx-0.5 min-[484px]:basis-(--navigation-item-icon-size,24px) [&>svg]:h-full [&>svg]:w-full ${isSelected ? "[&>svg]:fill-(--keyColor)" : "[&>svg]:fill-(--navigation-item-icon-color,var(--systemPrimary))"}`}
      >
        {item.icon}
      </span>

      <span className="flex-1 -m-1 overflow-hidden p-1 text-ellipsis whitespace-nowrap text-left">
        {item.label}
      </span>
    </div>
  );
}

function PinnedSidebarItemContent({
  item,
  isSelected,
  onPinNavigate,
}: Omit<SidebarItemContentProps, "item"> & {
  item: SidebarNavigationItem;
}) {
  const artworkSrcSet = item.artworkSrcSet;
  const isExplicit = item.isExplicit;
  const { isCurrentPin, isPinPlaying, playPin, resourceId } =
    usePinnedSidebarPlayback(item, true);

  return (
    <div
      className={`items-center rounded-[inherit] flex gap-2 size-full in-[.app-container]:gap-1.5 min-[484px]:in-[.app-container]:gap-0.5 ${isCurrentPin ? "[--playButtonOpacity:1]" : ""} ${isSelected ? "text-(--keyColor)" : "text-(--navigation-item-text-color,var(--systemPrimary))"}`}
    >
      <span
        className={`max-[483px]:basis-(--navigation-item-icon-size,28px) flex-[0_0] basis-(--navigation-item-icon-size,32px) leading-0 in-[.app-container]:mx-0.5 min-[484px]:basis-(--navigation-item-icon-size,24px) [&>svg]:h-full [&>svg]:w-full ${isSelected ? "[&>svg]:fill-(--keyColor)" : "[&>svg]:fill-(--navigation-item-icon-color,var(--systemPrimary))"}`}
      >
        <div className="[--navigation-item-icon-color:#fff] grid relative rounded-[3px] [grid-template-areas:'pin-artwork']">
          <div className="[grid-area:pin-artwork]">
            <div
              className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0) min-w-(--artwork-override-min-width,0) overflow-hidden relative w-(--artwork-override-width,100%) z-(--z-default) after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:content-[''] after:block after:h-0 after:max-h-full after:max-w-full after:min-h-full after:min-w-full after:opacity-(--containerInnerStrokeAlpha,0.1) after:pointer-events-none after:absolute after:top-0 after:w-full after:z-[calc(var(--z-default)+1)] dark:after:opacity-(--containerInnerStrokeAlpha,0.25)"
              style={
                {
                  "--aspect-ratio": "1",
                  "--placeholder-bg-color": "transparent",
                } as CSSProperties
              }
            >
              <ResponsiveArtwork
                alt={item.label}
                className="block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0px) min-w-(--artwork-override-min-width,0px) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%) rounded-[inherit] transition-(--global-transition,opacity_.1s_ease-in)"
                height={40}
                pictureClassName="block size-full"
                role="presentation"
                sizes="40px"
                src="/assets/artwork/1x1.gif"
                srcSet={artworkSrcSet}
                style={{ opacity: 1 }}
                width={40}
              />
            </div>
          </div>

          <div className="[grid-area:pin-artwork] opacity-(--playButtonOpacity,0) items-center bg-[rgba(0,0,0,.45)] flex justify-center z-[calc(var(--z-default)+1)]">
            <button
              aria-label={`${isPinPlaying ? "Pause" : "Play"} ${item.label}`}
              className="[--nonPlatterIconFill:#fff] [--playingBarColor:var(--nonPlatterIconFill)] leading-0 relative size-full"
              onClick={playPin}
              type="button"
            >
              {isCurrentPin ? (
                <div className="bottom-0 inset-x-0 m-auto absolute top-0 h-3 pointer-events-none w-full">
                  <PlaybackWaveform
                    isPlaying={isPinPlaying}
                    seed={resourceId ?? item.key}
                  />
                  <div className="bottom-0 inset-x-0 m-auto opacity-0 absolute top-0 z-1 group-hover/pin:opacity-100">
                    {isPinPlaying ? (
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 16 16"
                        xmlns="http://www.w3.org/2000/svg"
                        className="fill-white inline-block align-bottom"
                        aria-hidden="true"
                      >
                        <path d="M9.918.464h2.672a.89.89 0 0 1 .89.89v13.291a.89.89 0 0 1-.89.891H9.918a.89.89 0 0 1-.89-.89V1.354a.89.89 0 0 1 .89-.891zm-6.371 0h2.398c.567 0 1.027.46 1.027 1.028v13.016c0 .568-.46 1.028-1.027 1.028H3.547c-.567 0-1.028-.46-1.028-1.028V1.492c0-.568.46-1.028 1.028-1.028z" />
                      </svg>
                    ) : (
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 16 16"
                        xmlns="http://www.w3.org/2000/svg"
                        className="fill-white inline-block align-bottom"
                        aria-hidden="true"
                      >
                        <path d="m4.4 15.14 10.386-6.096c.842-.459.794-1.64 0-2.097L4.401.85c-.87-.53-2-.12-2 .82v12.625c0 .966 1.06 1.4 2 .844z" />
                      </svg>
                    )}
                  </div>
                </div>
              ) : (
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  xmlns="http://www.w3.org/2000/svg"
                  className="fill-white inline-block align-bottom"
                  aria-hidden="true"
                >
                  <path d="m4.4 15.14 10.386-6.096c.842-.459.794-1.64 0-2.097L4.401.85c-.87-.53-2-.12-2 .82v12.625c0 .966 1.06 1.4 2 .844z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </span>

      <Link
        href={item.href}
        onClick={onPinNavigate}
        className="flex-1 -m-1 overflow-hidden p-1 text-ellipsis whitespace-nowrap text-left"
        aria-current={isSelected ? "page" : undefined}
      >
        <div className="inline-grid gap-1 grid-cols-[1fr_auto] ps-1">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {item.label}
          </span>

          {isExplicit && (
            <span aria-label="Explicit" className="[--explicitBadgeSize:11px]">
              <ExplicitBadgeIcon />
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}
