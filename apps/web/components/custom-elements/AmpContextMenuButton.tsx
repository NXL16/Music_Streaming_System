const ICON_PATH =
  "M10.105 14c0-.87-.687-1.55-1.564-1.55-.862 0-1.557.695-1.557 1.55 0 .848.695 1.55 1.557 1.55.855 0 1.564-.702 1.564-1.55zm5.437 0c0-.87-.68-1.55-1.542-1.55A1.55 1.55 0 0012.45 14c0 .848.695 1.55 1.55 1.55.848 0 1.542-.702 1.542-1.55zm5.474 0c0-.87-.687-1.55-1.557-1.55-.87 0-1.564.695-1.564 1.55 0 .848.694 1.55 1.564 1.55.848 0 1.557-.702 1.557-1.55z";

const AmpCustomTag = "amp-contextual-menu-button" as React.ElementType;

export default function AmpContextMenuButton({ isHover = false }) {
  return (
    <AmpCustomTag hydrated="">
      <button
        type="button"
        onClick={() => {}}
        className="m-0 p-0 block border-0 outline-none cursor-pointer appearance-none font-inherit text-inherit leading-inherit rounded-(--ctxmenu-trigger-border-radius,50%) bg-(--ctxmenu-trigger-background-color,transparent) transition-opacity duration-100 ease-in opacity-(--ctxmenu-trigger-opacity,1) backdrop-blur-(--ctxmenu-trigger-backdrop-blur,0)"
      >
        <span
          className={`leading-0 block [--iconCircleFill:var(--contextMenuCircleFillOverride,transparent)] [--iconEllipsisFill:var(--contextMenuEllipsisFillOverride,#fff)] rounded-full h-(--contextMenuButtonSize,30px) w-(--contextMenuButtonSize,30px) backdrop-saturate-180 backdrop-blur-[60px] ${isHover ? "bg-(--systemStandardThinMaterialSover) hover:[--iconCircleFill:var(--contextMenuCircleHoverFill,var(--keyColor))] hover:[--iconEllipsisFill:var(--contextMenuEllipsisHoverFill,#fff)] hover:backdrop-filter-none hover:bg-transparent" : ""}`}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            className="size-full rounded-[inherit]"
            xmlns="http://www.w3.org/2000/svg"
          >
            {isHover && (
              <circle
                fill="var(--iconCircleFill, transparent)"
                cx="14"
                cy="14"
                r="14"
              />
            )}
            <path fill="var(--iconEllipsisFill, white)" d={ICON_PATH} />
          </svg>
        </span>
      </button>
    </AmpCustomTag>
  );
}
