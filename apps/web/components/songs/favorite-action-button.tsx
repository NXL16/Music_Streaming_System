type FavoriteActionButtonProps = {
  active: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onClick: () => void;
};

export function FavoriteActionButton({
  active,
  disabled,
  ariaLabel,
  onClick,
}: FavoriteActionButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`items-center flex h-(--favoriteButtonSize,100%) justify-center leading-0 w-(--favoriteButtonSize,100%) rounded-[50%] [--favoriteIconStarOutline:var(--favoriteButtonStarOutline)] ${active ? "[--favoriteIconStarCutout:var(--favoriteButtonStarCutout,var(--keyColor))] [--favoriteIconStarFill:var(--favoriteButtonStarFill,#fff)] bg-(--favoriteButtonBackground,var(--keyColor))" : "bg-(--favoriteButtonBackground,var(--systemQuinary))"}`}
    >
      {active ? (
        <svg
          width="60"
          height="60"
          viewBox="0 0 60 60"
          xmlns="http://www.w3.org/2000/svg"
          className="size-(--favoriteIconSize,28px)"
        >
          <circle
            className="fill-(--favoriteIconStarFill,transparent)"
            cx="30"
            cy="30"
            r="28"
          />
          <path
            className="fill-(--favoriteIconStarCutout,var(--systemQuinary))"
            d="M30 60c16.412 0 30-13.618 30-30C60 13.588 46.382 0 29.97 0 13.588 0 0 13.588 0 30c0 16.382 13.618 30 30 30Zm-8.706-14.324c-1.765 1.353-3.647-.029-2.941-2.117l3.412-10.265-8.794-6.265c-1.647-1.205-1.089-3.558 1.147-3.529l10.794.088 3.294-10.323c.647-2.03 2.94-2.03 3.588 0l3.294 10.323 10.794-.088c2.265-.03 2.765 2.353 1.147 3.5l-8.794 6.294 3.441 10.265c.677 2.088-1.176 3.47-2.97 2.117L30 39.324l-8.706 6.352Z"
          />
        </svg>
      ) : (
        <svg
          width="60"
          height="60"
          viewBox="0 0 60 60"
          xmlns="http://www.w3.org/2000/svg"
          className="size-(--favoriteIconSize,28px)"
        >
          <path
            className="fill-(--favoriteIconStarOutline,var(--keyColor))"
            d="M19.337 44.944c.851.647 1.887.448 3.031-.393l7.444-5.465 7.445 5.465c1.145.84 2.181 1.04 3.033.393.832-.63 1.006-1.68.55-2.99l-2.941-8.742 7.508-5.386c1.144-.806 1.644-1.747 1.3-2.756-.337-.992-1.282-1.476-2.679-1.459l-9.201.07-2.8-8.804c-.43-1.342-1.16-2.083-2.215-2.083-1.044 0-1.775.741-2.212 2.083l-2.8 8.805-9.21-.071c-1.389-.017-2.327.467-2.67 1.45-.345 1.018.163 1.959 1.3 2.765l7.507 5.386-2.94 8.742c-.456 1.31-.283 2.36.55 2.99zm3.418-4.686c-.022-.03-.028-.051-.007-.123l2.575-7.008c.338-.969.296-1.407-.635-2.02l-6.197-4.162c-.053-.04-.075-.071-.064-.102.01-.03.042-.039.113-.039l7.46.262c1.03.026 1.439-.212 1.716-1.215l2.025-7.175c.02-.071.04-.095.071-.095.031 0 .051.024.073.095l2.026 7.175c.277 1.003.693 1.241 1.732 1.215l7.452-.262c.071 0 .103.009.113.04.01.03-.011.052-.064.101l-6.206 4.17c-.922.614-.973 1.043-.628 2.012l2.569 7.008c.02.072.015.094-.007.123-.022.029-.053 0-.105-.033l-5.873-4.615c-.827-.648-1.326-.648-2.162 0l-5.864 4.615c-.052.033-.083.062-.113.033z"
          />
        </svg>
      )}
    </button>
  );
}
