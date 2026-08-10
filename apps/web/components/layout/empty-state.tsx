export default function EmptyState() {
  return (
    <div className="bottom-0 text-(--systemSecondary) h-41.5 inset-x-0 m-auto max-w-110 p-[0_25px] absolute text-center top-0 z-1">
      <div className="leading-0 mb-5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="45"
          height="53"
          viewBox="0 0 45 53"
          className="h-18 w-auto fill-(--systemSecondary) min-[1000px]:h-19.5 align-baseline inline-block"
        >
          <path
            fillRule="nonzero"
            d="M15.208 37.347V7.422c0-1.537 1.107-2.196 2.372-2.447l23.91-4.8C43.671-.264 45-.013 45 2.497v36.7c0 6.902-5.535 8.376-9.014 8.376-3.447 0-6.293-2.635-6.293-5.991 0-4.047 3.068-5.74 6.958-6.525l3.51-.784c1.423-.282 1.866-1.317 1.866-2.415l.032-17.567c0-1.223-.57-1.662-1.961-1.349L19.825 17.02c-1.17.189-1.518.534-1.518 1.914v25.534C18.307 51.4 12.677 53 9.2 53 5.689 53 3 50.334 3 47.009c0-4.11 3.1-5.804 6.8-6.682l3.763-.753c1.17-.282 1.645-1.192 1.645-2.227"
          ></path>
        </svg>
      </div>

      <h2 className="text-(--systemPrimary) [font:var(--title-2-emphasized)] mb-2.25 min-[1000px]:[font:var(--large-title-emphasized)]">
        Add music to your library
      </h2>

      <p className="[font:var(--body)] mb-1.25 min-[1000px]:[font:var(--title-3)]">
        Browse millions of songs and collect your favourite here.
      </p>

      <div className="[--pillButtonTextColor:#fff] [--pillButtonBackgroundColor:var(--keyColor)] [--buttonWrapperWidth:auto] items-center flex justify-center mt-3.75">
        <div className="w-(--buttonWrapperWidth,100%) [--buttonBackgroundColor:var(--pillButtonBackgroundColor,rgba(var(--keyColor-rgb),.06))] [--buttonTextColor:var(--pillButtonTextColor,var(--keyColor))] min-[1260px]:w-(--buttonWrapperWidth,auto)">
          <button
            type="button"
            className="[justify-content:var(--buttonJustifyContent,center)] text-(--buttonTextColor,#fff) [display:var(--buttonDisplay,flex)] items-center bg-(--buttonBackgroundColor,var(--keyColorBG,var(--systemBlue))) rounded-(--buttonBorderRadius,16px) [font:var(--pill-button-font,var(--body-semibold-tall))] h-(--buttonHeight,28px) min-w-(--buttonMinWidth,90px) px-(--buttonPadding,16px) w-(--buttonWidth,auto)"
          >
            Browse Music
          </button>
        </div>
      </div>
    </div>
  );
}
