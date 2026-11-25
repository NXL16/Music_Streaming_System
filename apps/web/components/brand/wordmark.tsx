import localFont from "next/font/local";
import type { CSSProperties } from "react";
import Logo from "@/components/custom-elements/Logo";
import styles from "./wordmark.module.css";

const ravento = localFont({
  src: "../../public/fonts/Ravento/Ravento-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "block",
  preload: true,
});

export function Wordmark({
  className,
  intro = false,
}: {
  className?: string;
  intro?: boolean;
}) {
  return (
    <p
      className={`${styles.wordmark} ${ravento.className}${className ? ` ${className}` : ""}`}
      aria-label="404hz melodies"
      data-intro={intro || undefined}
    >
      <span
        className={intro ? styles.brandLine : undefined}
        data-brand-part={intro ? undefined : "title"}
      >
        {intro ? (
          <>
            <Logo className={styles.mascot} />
            <span className={styles.brandTitle} data-brand-part="title">
              404hz
            </span>
          </>
        ) : (
          "404hz"
        )}
      </span>
      <span className="rotate-355 -mt-0.75" data-brand-part="signature">
        {intro ? (
          <svg
            viewBox="0 0 480 150"
            aria-hidden="true"
            className={styles.signature}
          >
            <text x="240" y="110" textAnchor="middle" fontSize="100">
              {Array.from("Melodies", (letter, index) => (
                <tspan
                  key={index}
                  style={{ "--letter": index } as CSSProperties}
                >
                  {letter}
                </tspan>
              ))}
            </text>
          </svg>
        ) : (
          "Melodies"
        )}
      </span>
    </p>
  );
}
