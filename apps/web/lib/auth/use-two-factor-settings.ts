"use client";

import { useRef, useState } from "react";
import {
  securityFormError,
  validateVerificationForm,
} from "./auth-form-validation";
import { useRouter } from "next/navigation";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  logout,
  regenerateTwoFactorRecoveryCodes,
} from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";
import { resolveTwoFactorVerificationInput } from "@/lib/auth/two-factor-verification";

type SetupData = {
  secret: string;
  otpauthUrl: string;
};

type SecurityForm = { password: string; verificationInput: string };
const initialSecurityForm: SecurityForm = {
  password: "",
  verificationInput: "",
};

export function useTwoFactorSettings() {
  const inFlight = useRef(false);
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [disableForm, setDisableForm] =
    useState<SecurityForm>(initialSecurityForm);
  const [regenerateForm, setRegenerateForm] =
    useState<SecurityForm>(initialSecurityForm);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loadingAction, setLoadingAction] = useState<
    "setup" | "confirm" | "disable" | "regenerate" | null
  >(null);

  function resetFeedback() {
    setError("");
  }

  function updateDisableField<TField extends keyof SecurityForm>(
    field: TField,
    value: SecurityForm[TField],
  ) {
    setDisableForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateRegenerateField<TField extends keyof SecurityForm>(
    field: TField,
    value: SecurityForm[TField],
  ) {
    setRegenerateForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function startSetup() {
    if (inFlight.current) return;
    resetFeedback();
    setRecoveryCodes([]);
    inFlight.current = true;
    setLoadingAction("setup");

    try {
      const result = await beginTwoFactorSetup();
      setSetupData(result.data);
    } catch (error) {
      setError(
        securityFormError(
          error,
          "Could not start two-factor setup. Please try again.",
        ),
      );
    } finally {
      inFlight.current = false;
      setLoadingAction(null);
    }
  }

  async function confirmSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    resetFeedback();
    const validation = validateVerificationForm(
      { verificationInput: confirmCode },
      false,
    );
    if (validation.verificationInput) {
      setError(validation.verificationInput);
      return;
    }
    inFlight.current = true;
    setLoadingAction("confirm");

    try {
      const result = await confirmTwoFactorSetup({
        code: confirmCode.trim(),
      });

      setUser(result.data.user);
      setRecoveryCodes(result.data.recoveryCodes);
      setSetupData(null);
      setConfirmCode("");
    } catch (error) {
      setError(
        securityFormError(
          error,
          "That code could not be verified. Please try again.",
        ),
      );
    } finally {
      inFlight.current = false;
      setLoadingAction(null);
    }
  }

  async function disable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    resetFeedback();
    const validation = validateVerificationForm({
      verificationInput: disableForm.verificationInput,
    });
    if (!disableForm.password || validation.verificationInput) {
      setError(
        !disableForm.password
          ? "Enter your password."
          : validation.verificationInput || "",
      );
      return;
    }
    inFlight.current = true;
    setLoadingAction("disable");

    try {
      await disableTwoFactor({
        password: disableForm.password,
        ...resolveTwoFactorVerificationInput(disableForm.verificationInput),
      });

      await logout().catch(() => undefined);
      clearSession();
      router.push("/login");
    } catch (error) {
      setError(
        securityFormError(
          error,
          "Could not turn off two-factor authentication. Check your details and try again.",
        ),
      );
    } finally {
      inFlight.current = false;
      setLoadingAction(null);
    }
  }

  async function regenerateRecoveryCodes(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (inFlight.current) return;
    resetFeedback();
    const validation = validateVerificationForm({
      verificationInput: regenerateForm.verificationInput,
    });
    if (!regenerateForm.password || validation.verificationInput) {
      setError(
        !regenerateForm.password
          ? "Enter your password."
          : validation.verificationInput || "",
      );
      return;
    }
    inFlight.current = true;
    setLoadingAction("regenerate");

    try {
      const result = await regenerateTwoFactorRecoveryCodes({
        password: regenerateForm.password,
        ...resolveTwoFactorVerificationInput(regenerateForm.verificationInput),
      });

      setRecoveryCodes(result.data.recoveryCodes);
      setRegenerateForm(initialSecurityForm);
    } catch (error) {
      setError(
        securityFormError(
          error,
          "Could not generate recovery codes. Check your details and try again.",
        ),
      );
    } finally {
      inFlight.current = false;
      setLoadingAction(null);
    }
  }

  function cancelSetup() {
    setSetupData(null);
    setConfirmCode("");
    resetFeedback();
  }

  return {
    confirmCode,
    disableForm,
    error,
    loadingAction,
    recoveryCodes,
    regenerateForm,
    setupData,
    reset: () => {
      if (inFlight.current) return;
      cancelSetup();
      setDisableForm(initialSecurityForm);
      setRegenerateForm(initialSecurityForm);
      setRecoveryCodes([]);
    },
    confirmSetup,
    disable,
    regenerateRecoveryCodes,
    setConfirmCode,
    startSetup,
    updateDisableField,
    updateRegenerateField,
  };
}
