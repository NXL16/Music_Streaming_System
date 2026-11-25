"use client";

import { useRef, useState, type FormEvent } from "react";
import { useMinimumLoadingState } from "@/lib/loading/use-minimum-loading-duration";
import {
  authFormError,
  type FieldErrors,
  type AuthFormMode,
} from "./auth-form-validation";

export function useAuthForm<T extends Record<string, string>>(
  initialValues: T,
  validate: (values: T) => FieldErrors<T>,
  onSubmit: (values: T) => Promise<void>,
  mode: AuthFormMode,
) {
  const [form, setForm] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<T>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useMinimumLoadingState();
  const submitting = useRef(false);

  function updateField(field: keyof T, value: string) {
    const next = { ...form, [field]: value };
    setForm(next);
    setError("");
    setFieldErrors((current) =>
      current[field] ? { ...current, [field]: validate(next)[field] } : current,
    );
  }

  function validateField(field: keyof T) {
    if (!form[field].trim()) return;
    const fieldError = validate(form)[field];
    setFieldErrors((current) => ({
      ...current,
      [field]: fieldError,
    }));
  }

  function validateForm(
    element: HTMLFormElement,
    fields?: readonly (keyof T)[],
  ) {
    const allErrors = validate(form);
    const errors = fields
      ? (Object.fromEntries(
          Object.entries(allErrors).filter(([field]) => fields.includes(field)),
        ) as FieldErrors<T>)
      : allErrors;
    setFieldErrors(errors);
    setError("");
    const firstField = Object.keys(errors)[0];
    if (firstField) {
      const input = element.elements.namedItem(firstField);
      if (input instanceof HTMLElement) input.focus();
      return false;
    }
    return true;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !validateForm(event.currentTarget)) return;
    submitting.current = true;
    setLoading(true);
    try {
      await onSubmit(form);
    } catch (error) {
      setError(authFormError(error, mode));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return {
    form,
    fieldErrors,
    error,
    loading,
    clearError: () => setError(""),
    reset: () => {
      setForm(initialValues);
      setFieldErrors({});
      setError("");
    },
    updateField,
    validateField,
    validateForm,
    handleSubmit,
  };
}
