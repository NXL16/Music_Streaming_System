"use client";

type RequestErrorStateProps = {
  onRetry: () => void;
};

export function RequestErrorState({ onRetry }: RequestErrorStateProps) {
  return (
    <div
      role="alert"
      className="request-error-state [--buttonTextColor:var(--systemSecondary)] [--buttonBorderColor:var(--systemSecondary)] items-center text-(--systemSecondary) flex flex-col gap-3 left-1/2 m-auto max-w-110 px-6.25 absolute text-center top-1/2 -translate-x-1/2 -translate-y-1/2 z-(--z-default)"
    >
      <h2 className="[font:var(--title-2)] mb-1.25">An error occurred.</h2>
      <div className="w-auto">
        <button
          type="button"
          onClick={onRetry}
          className="items-center bg-(--buttonBackgroundColor,var(--keyColorBG,var(--systemBlue))) rounded-(--buttonRadius,3px) [display:var(--buttonDisplay,flex)] [justify-content:var(--buttonJustifyContent,center)] [--buttonBackgroundColor:transparent] border border-solid border-(--buttonBorderColor,var(--keyColor,var(--systemBlue))) text-(--buttonTextColor,var(--keyColor)) [font:var(--body-tall)] min-w-(--buttonMinWidth,108px) pe-4 ps-4 min-[1260px]:h-(--buttonHeight,28px) min-[1260px]:w-(--buttonWidth,auto)"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
