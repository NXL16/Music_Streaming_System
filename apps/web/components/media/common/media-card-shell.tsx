import { useMenuStore } from "@/lib/menu/use-menu-store";
import { useRouter } from "next/navigation";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

type MediaCardShellProps = {
  id: string;
  children: ReactNode;
  isHero?: boolean;
  artworkColor: string;
  metadataTextPrimary?: string;
  metadataTextSecondary?: string;
  metadataTextTertiary?: string;
  href?: string;
  liClassName?: string;
  isArtistShelfItem?: boolean;
  onOpen?: () => void;
};

export default function MediaCardShell({
  id,
  children,
  isHero = false,
  artworkColor,
  metadataTextPrimary,
  href,
  liClassName,
  isArtistShelfItem = false,
  onOpen,
}: MediaCardShellProps) {
  const activeId = useMenuStore((s) => s.activeId);
  const router = useRouter();
  const isMenuOpen = activeId === id;

  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!href || event.defaultPrevented) return;
    if (
      event.target instanceof Element &&
      event.target.closest(
        "a, button, input, select, textarea, [role='button']",
      )
    ) {
      return;
    }

    onOpen?.();
    router.push(href);
  };

  return (
    <li
      className={
        isArtistShelfItem
          ? "shelf-grid__list--artist-item"
          : `-mt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) -me-(--standard-lockup-shadow-offset,15px) -mb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) -ms-(--standard-lockup-shadow-offset,15px) pe-(--standard-lockup-shadow-offset,15px) pb-(--override-shelf-overflow-bleed-bottom,var(--standard-lockup-shadow-offset,15px)) pt-(--override-shelf-overflow-bleed-top,var(--standard-lockup-shadow-offset,15px)) ps-(--standard-lockup-shadow-offset,15px) snap-start -scroll-ms-(--standard-lockup-shadow-offset) ${isHero ? "self-end" : ""} ${liClassName ?? ""}`
      }
    >
      <div
        onClick={handleCardClick}
        className={`media-card-shell group ${isMenuOpen ? "[--scrimOpacity:1] [@media(hover:hover)_and_(pointer:fine)]:[--scrimOpacity:1]" : ""} hover:[--scrimOpacity:1] [@media(hover:hover)_and_(pointer:fine)]:[--scrimOpacity:0] ${isHero ? "[--feature-recommended-chin-height:68px] rounded-(--global-border-radius-xlarge,14px) mt-2.75 mb-2 relative align-baseline whitespace-normal w-full z-(--z-default) [--global-border-radius-xlarge:10px] [--badge-x-inset:10px] [--icon:rgba(235,235,245,0.3)] [--genericJoeColor:#262629] aspect-3/4 cursor-pointer before:content-[''] before:absolute before:top-0 before:bottom-0 before:inset-s-1.5 before:inset-e-1.5 before:rounded-[inherit] before:shadow-[0_7px_16px_rgba(0,0,0,0.28)] before:z-[calc(var(--z-default)-1)] after:block after:absolute after:top-0 after:w-full after:h-0 after:min-w-full after:max-w-full after:min-h-full after:max-h-full after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:opacity-(--containerInnerStrokeAlpha,0.25) after:pointer-events-none after:z-[calc(var(--z-default)+1)]" : "h-full min-w-0 cursor-pointer"}`}
        style={
          isHero
            ? ({
                "--artwork-background-color": artworkColor,
                "--metadata-color-override": metadataTextPrimary ?? "#ffffff",
                "--legibility-gradient-color": "0, 0, 0",
              } as CSSProperties)
            : undefined
        }
      >
        {children}
      </div>
    </li>
  );
}
