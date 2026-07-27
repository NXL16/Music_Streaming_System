import type { CSSProperties } from "react";

type ISpinnerProps = {
  className?: string;
  size?: number;
};

const bladeIndexes = Array.from({ length: 8 }, (_, index) => index + 1);

export function Spinner({ className, size = 20 }: ISpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={`ispinner${className ? ` ${className}` : ""}`}
      style={{ "--ispinner-size": `${size}px` } as CSSProperties}
    >
      {bladeIndexes.map((index) => (
        <span key={index} className="ispinner-blade" />
      ))}
    </span>
  );
}
