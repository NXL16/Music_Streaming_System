"use client";

import {
  useState,
  type ComponentPropsWithRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import styles from "./auth-form.module.css";
import { AuthNavigationLink } from "./auth-navigation";

export function AuthForm({
  title,
  signup = false,
  recovery = false,
  description,
  hideFooter = false,
  footer,
  navigationDisabled = false,
  children,
  ...props
}: ComponentPropsWithRef<"form"> & {
  title: string;
  signup?: boolean;
  recovery?: boolean;
  description?: string;
  hideFooter?: boolean;
  footer?: ReactNode;
  navigationDisabled?: boolean;
}) {
  const href = signup || recovery ? "/login" : "/signup";
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="auth-title">
        <Wordmark className={styles.wordmark} />

        <div className={styles.content}>
          <h1 id="auth-title" aria-live="polite">
            {title}
          </h1>

          {description && <p className={styles.description}>{description}</p>}

          <form
            {...props}
            noValidate
            aria-labelledby="auth-title"
            className={styles.form}
          >
            {children}
          </form>

          {!hideFooter && (
            <p className={styles.footer}>
              {footer ?? (
                <>
                  {recovery
                    ? "Remember your password?"
                    : signup
                      ? "Already have an account?"
                      : "New here?"}
                  <AuthNavigationLink
                    href={href}
                    className="ml-1"
                    disabled={navigationDisabled}
                  >
                    {signup || recovery ? "Sign in" : "Create an account"}
                  </AuthNavigationLink>
                </>
              )}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

export function AuthInput({
  id,
  label,
  error,
  feedback,
  type = "text",
  compact = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  feedback?: ReactNode;
  compact?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const password = type === "password";
  const message = feedback ?? error;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.hiddenLabel}>
        {label}
      </label>

      <div className={styles.inputWrap} data-compact={compact || undefined}>
        <input
          placeholder={label}
          {...props}
          id={id}
          type={password && visible ? "text" : type}
          aria-required="true"
          aria-invalid={Boolean(error)}
          aria-describedby={message ? `${id}-message` : undefined}
          className={password ? styles.password : undefined}
        />

        {password && (
          <button
            type="button"
            className={styles.reveal}
            disabled={props.disabled}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {message && (
        <div
          id={`${id}-message`}
          className={feedback ? undefined : styles.fieldError}
          aria-live="polite"
        >
          {message}
        </div>
      )}
    </div>
  );
}

export function AuthFormSubmit({
  disabled,
  message,
  reserveFeedbackSpace = true,
  className,
  children,
}: {
  disabled: boolean;
  message: string | null;
  reserveFeedbackSpace?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.submitArea}>
      {(message || reserveFeedbackSpace) && (
        <div
          className={styles.feedback}
          data-compact={!reserveFeedbackSpace || undefined}
        >
          {message && (
            <p role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              <span>{message}</span>
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        className={`${styles.submit} ${className ?? (!reserveFeedbackSpace && !message ? "mt-5" : "")}`}
        disabled={disabled}
      >
        {children}
      </button>
    </div>
  );
}

export function GoogleLoginButton({
  loading,
  disabled,
  onClick,
}: {
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <>
      <div className={styles.separator}>
        <span>or continue with</span>
      </div>

      <button
        type="button"
        className={styles.google}
        disabled={disabled}
        onClick={onClick}
      >
        <span className={styles.googleContent}>
          <span className={styles.googleLogo} aria-hidden="true" />
          <span className={styles.googleText}>
            {loading ? "Opening Google..." : "Continue with Google"}
          </span>
        </span>
      </button>
    </>
  );
}
