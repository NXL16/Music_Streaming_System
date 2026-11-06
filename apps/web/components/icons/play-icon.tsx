interface PlayIconProps {
  className: string;
  fill?: string;
}

export default function PlayIcon({ className, fill }: PlayIconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        fill={fill ?? "var(--nonPlatterIconFill, var(--keyColor, black))"}
        d="m4.4 15.14 10.386-6.096c.842-.459.794-1.64 0-2.097L4.401.85c-.87-.53-2-.12-2 .82v12.625c0 .966 1.06 1.4 2 .844z"
      />
    </svg>
  );
}
