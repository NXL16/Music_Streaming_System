"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signup } from "./auth.api";
import { useAuthStore } from "./auth-store";
import { getOrCreateDeviceId } from "./device-id";
import {
  validateSignupForm,
  type SignupFormValues,
} from "./auth-form-validation";
import { useAuthForm } from "./use-auth-form";

export function useSignupForm() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [step, setStep] = useState<1 | 2>(1);
  const auth = useAuthForm<SignupFormValues>(
    { displayName: "", username: "", email: "", password: "" },
    validateSignupForm,
    async (form) => {
      const result = await signup({
        ...form,
        displayName: form.displayName.trim(),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        deviceId: getOrCreateDeviceId(),
      });
      setSession(
        result.data.accessToken,
        result.data.user,
        result.data.expiresIn,
      );
      router.replace("/home");
    },
    "signup",
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (auth.loading) return;
    if (step === 1) {
      if (auth.validateForm(event.currentTarget, ["email", "password"]))
        setStep(2);
      return;
    }
    return auth.handleSubmit(event);
  }

  return {
    ...auth,
    step,
    goBack: () => {
      if (auth.loading) return;
      auth.clearError();
      setStep(1);
    },
    handleSubmit,
  };
}
