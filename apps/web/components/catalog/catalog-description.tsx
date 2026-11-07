"use client";

import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ContentDialog } from "./content-dialog";

type CatalogDescriptionProps = {
  description: string;
  title: string;
  detailLine: ReactNode;
};

export function CatalogDescription({
  description,
  title,
  detailLine,
}: CatalogDescriptionProps) {
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useLayoutEffect(() => {
    const element = descriptionRef.current;
    if (!element) return;

    const checkOverflow = () => {
      // A small tolerance prevents sub-pixel layout rounding from showing MORE.
      setIsOverflowing(element.scrollHeight > element.clientHeight + 1);
    };

    checkOverflow();

    const observer = new ResizeObserver(checkOverflow);
    observer.observe(element);
    return () => observer.disconnect();
  }, [description]);

  return (
    <div className="wrap-anywhere [--truncate-font:var(--body-tall)] [grid-area:description] mt-4.5 max-w-110 min-[1000]:self-end min-[1000]:min-h-13.5 min-[1000]:mb-3.75 min-[1000]:mt-0">
      <div className="relative z-(--z-default) text-(--systemSecondary) truncate-wrapper">
        <p
          ref={descriptionRef}
          className={`line-clamp-(--lines) [font:var(--truncate-font,var(--body-tall))] whitespace-pre-wrap wrap-anywhere ${isOverflowing ? "with-more-button" : ""}`}
          style={
            {
              "--lines": "3",
              "--line-height": "var(--lineHeight, 16)",
              "--link-length": "4",
            } as CSSProperties
          }
        >
          {description}
        </p>

        {isOverflowing && (
          <button
            className="more bottom-(--moreBottomPositionOverride,1px) text-(--moreTextColorOverride,var(--systemPrimary)) [font:var(--moreFontOverride,var(--subhead-emphasized))] inset-e-0 ps-1.25 absolute z-(--z-default)"
            type="button"
            onClick={() => setIsDialogOpen(true)}
          >
            MORE
          </button>
        )}
      </div>

      <ContentDialog
        open={isDialogOpen}
        title={title}
        subtitle={detailLine}
        hideGradient
        onClose={() => setIsDialogOpen(false)}
      >
        <p className="content-modal-text">{description}</p>
      </ContentDialog>
    </div>
  );
}
