type EmptyStateVariant = "music" | "music-videos" | "made-for-you";

type EmptyStateProps = {
  variant?: EmptyStateVariant;
};

export default function EmptyState({ variant = "music" }: EmptyStateProps) {
  if (variant === "made-for-you") {
    return (
      <div className="bottom-0 text-(--systemSecondary) flex flex-col h-41.5 inset-x-0 justify-center m-auto max-w-110 p-[0_25px] absolute text-center top-0 z-1">
        <div className="">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="50"
            height="50"
            viewBox="0 0 50 50"
            className="h-auto mb-2 w-17.5 fill-(--systemSecondary) align-baseline inline-block"
          >
            <path d="M8.528 50h32.944C47.176 50 50 47.176 50 41.58V8.42C50 2.823 47.176 0 41.472 0H8.528C2.852 0 0 2.797 0 8.42v33.16C0 47.203 2.852 50 8.528 50m-4.155-8.637V8.636c0-2.824 1.493-4.264 4.21-4.264h32.835c2.688 0 4.209 1.44 4.209 4.264v32.727c0 2.119-.869 3.477-2.444 3.993-2.363-6.654-9.533-11.299-18.17-11.299-8.663 0-15.806 4.645-18.169 11.326-1.602-.543-2.471-1.901-2.471-4.02m20.64-11.841c5.188.054 9.262-4.373 9.262-10.185 0-5.459-4.074-9.967-9.261-9.967-5.188 0-9.316 4.508-9.289 9.967.028 5.812 4.101 10.13 9.289 10.185z"></path>
          </svg>
        </div>

        <h2 className="[font:var(--title-2-emphasized)]">
          Personal mixes that you add will appear here.
        </h2>
      </div>
    );
  }

  const isMusicVideos = variant === "music-videos";

  return (
    <div className="bottom-0 text-(--systemSecondary) h-41.5 inset-x-0 m-auto max-w-110 p-[0_25px] absolute text-center top-0 z-1">
      <div className={`leading-0 ${isMusicVideos ? "mb-1.5" : "mb-5"}`}>
        {isMusicVideos ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            className="h-18 w-auto fill-(--systemSecondary) min-[1000px]:h-30 align-baseline inline-block"
          >
            <path d="M4.052 17.291h15.896c1.275 0 2.052-.788 2.052-2.061V6.052C22 4.779 21.223 4 19.948 4H4.052C2.777 4 2 4.779 2 6.052v9.178c0 1.273.777 2.061 2.052 2.061m.022-1.296c-.489 0-.787-.288-.787-.786V6.073c0-.49.298-.786.787-.786h15.852c.489 0 .787.296.787.786v9.136c0 .498-.298.786-.787.786zm3.906 3.999h8.04a.64.64 0 0 0 .645-.644.646.646 0 0 0-.645-.652H7.98a.646.646 0 0 0-.645.652.64.64 0 0 0 .645.644"></path>
            <path d="M14.405 9.188c.388-.098.505-.178.505-.646V6.971c0-.3-.107-.438-.536-.329l-2.337.578c-.398.099-.484.177-.484.647v3.604c0 .357-.031.425-.431.536l-.736.194c-.725.19-1.339.617-1.339 1.408 0 .677.515 1.172 1.318 1.172 1.143 0 1.92-.822 1.92-1.983v-2.747c0-.296.068-.375.238-.405z"></path>
          </svg>
        ) : (
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
        )}
      </div>

      <h2 className="text-(--systemPrimary) [font:var(--title-2-emphasized)] mb-2.25 min-[1000px]:[font:var(--large-title-emphasized)]">
        {isMusicVideos
          ? "Add Music Videos to Your Library"
          : "Add music to your library"}
      </h2>

      <p className="[font:var(--body)] mb-1.25 min-[1000px]:[font:var(--title-3)]">
        {isMusicVideos
          ? "Browse playlists of new and popular music videos and collect your favourites here."
          : "Browse millions of songs and collect your favourite here."}
      </p>

      <div className="[--pillButtonTextColor:#fff] [--pillButtonBackgroundColor:var(--keyColor)] [--buttonWrapperWidth:auto] items-center flex justify-center mt-3.75">
        <div className="w-(--buttonWrapperWidth,100%) [--buttonBackgroundColor:var(--pillButtonBackgroundColor,rgba(var(--keyColor-rgb),.06))] [--buttonTextColor:var(--pillButtonTextColor,var(--keyColor))] min-[1260px]:w-(--buttonWrapperWidth,auto)">
          <button
            type="button"
            className="[justify-content:var(--buttonJustifyContent,center)] text-(--buttonTextColor,#fff) [display:var(--buttonDisplay,flex)] items-center bg-(--buttonBackgroundColor,var(--keyColorBG,var(--systemBlue))) rounded-(--buttonBorderRadius,16px) [font:var(--pill-button-font,var(--body-semibold-tall))] h-(--buttonHeight,28px) min-w-(--buttonMinWidth,90px) px-(--buttonPadding,16px) w-(--buttonWidth,auto)"
          >
            {isMusicVideos ? "Browse Music Videos" : "Browse Music"}
          </button>
        </div>
      </div>
    </div>
  );
}
