type CardPlayButtonProps = {
  variant: "hero" | "cover" | "station";
};

export default function CardPlayButton({ variant }: CardPlayButtonProps) {
  if (variant === "hero") {
    return (
      <div className="absolute bottom-20.5 inset-s-auto inset-e-(--badge-x-inset) z-(--z-default) opacity-0 group-hover:opacity-100 transition-all duration-300 ease-in-out">
        <button className="rounded-[50%] [--iconCircleFillBG:var(--iconCircleFillBGOverride,var(--systemQuaternary))] [--iconFillArrow:var(--playButtonIconColor,#fff)] relative leading-0 pointer-events-auto z-(--z-default) [--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] not-[.play-button--artwork-overlay]:block not-[.play-button--artwork-overlay]:leading-0 hover:bg-[rgba(40,40,40,.5)]">
          <svg
            aria-hidden="true"
            className="inline-block h-7.5 w-7.5 rounded-[50%] bg-[rgba(40,40,40,.4)] backdrop-saturate-180 backdrop-blur-[60px]"
            data-icon-state="play"
          >
            <use href="#play-circle-fill"></use>
          </svg>
        </button>
      </div>
    );
  }

  if (variant === "station") {
    return (
      <div className="absolute inset-0 m-auto z-1 [--iconCircleFillBGOverride:transparent]">
        <button className="h-full w-full [--iconCircleFillBG:var(--iconCircleFillBGOverride,var(--systemQuaternary))] [--iconFillArrow:var(--playButtonIconColor,#fff)] rounded-none [--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] leading-0 pointer-events-auto relative z-(--z-default) block hover:[--iconCircleFillBG:var(--keyColor)] hover:[--iconFillArrow:#fff]">
          <svg
            aria-hidden="true"
            className="inline-block h-15 w-15 rounded-[50%] bg-(--systemStandardThinMaterialSover) backdrop-saturate-180 backdrop-blur-[60px] hover:bg-transparent hover:backdrop-filter-none"
            data-icon-state="play"
          >
            <use href="#play-circle-fill"></use>
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="[--iconCircleFillBGOverride:transparent] bottom-2.5 inset-s-2.5 leading-0 absolute z-(--z-default)">
      <button className="[--iconCircleFillBG:var(--iconCircleFillBGOverride,var(--systemQuaternary))] [--iconFillArrow:var(--playButtonIconColor,#fff)] rounded-[50%] [--nonPlatterIconFill:var(--playButtonIconColor,#fff)] [--playingBarColor:var(--nonPlatterIconFill,#fff)] leading-0 pointer-events-auto relative z-(--z-default) block hover:[--iconCircleFillBG:var(--keyColor)] hover:[--iconFillArrow:#fff]">
        <svg
          aria-hidden="true"
          className="inline-block h-7.5 w-7.5 rounded-[50%] bg-(--systemStandardThinMaterialSover) backdrop-saturate-180 backdrop-blur-[60px] hover:bg-transparent hover:backdrop-filter-none"
          data-icon-state="play"
        >
          <use href="#play-circle-fill"></use>
        </svg>
      </button>
    </div>
  );
}
