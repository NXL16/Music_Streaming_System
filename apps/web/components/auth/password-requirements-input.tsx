"use client";

import type { ComponentProps } from "react";
import { AUTH_PASSWORD_CHARACTER_PATTERNS } from "@musical/shared-constants";
import { AuthInput } from "./auth-form";
import styles from "./auth-form.module.css";

const requirements = [
  { label: "8+ characters", test: (value: string) => value.length >= 8 },
  ...Object.entries(AUTH_PASSWORD_CHARACTER_PATTERNS).map(([key, pattern]) => ({
    label:
      key === "symbol"
        ? "Symbol: @$!%*?&"
        : key === "number"
          ? "Number"
          : `${key === "lowercase" ? "Lowercase" : "Uppercase"} letter`,
    test: (value: string) => pattern.test(value),
  })),
];

export function PasswordRequirementsInput({
  reserveFeedbackSpace = false,
  ...props
}: Omit<ComponentProps<typeof AuthInput>, "type" | "feedback" | "value"> & {
  value: string;
  reserveFeedbackSpace?: boolean;
}) {
  const checks = requirements.map((rule) => rule.test(props.value));
  const completed = checks.filter(Boolean).length;
  const missing = requirements.filter((_, index) => !checks[index]);

  return (
    <AuthInput
      {...props}
      type="password"
      feedback={
        <div
          className={styles.passwordFeedback}
          data-reserve-space={reserveFeedbackSpace || undefined}
          data-visible={Boolean(props.value || props.error)}
        >
          <div
            className={styles.passwordMeter}
            role="progressbar"
            aria-label="Password requirements"
            aria-valuemin={0}
            aria-valuemax={requirements.length}
            aria-valuenow={completed}
            aria-valuetext={
              missing.length
                ? `${completed} of ${requirements.length} requirements. Missing: ${missing.map((rule) => rule.label).join(", ")}`
                : "Password ready"
            }
          >
            {requirements.map((rule, index) => (
              <span key={rule.label} data-complete={index < completed} />
            ))}
          </div>
          <p>
            <span>
              {completed}/{requirements.length} requirements
            </span>
            <span>{missing[0]?.label ?? "Password ready"}</span>
          </p>
        </div>
      }
    />
  );
}
