"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getApiErrorMessage } from "@/lib/api/api-error";
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

type DisableForm = {
  password: string;
  verificationInput: string;
};

type RegenerateForm = {
  password: string;
  verificationInput: string;
};

const initialDisableForm: DisableForm = {
  password: "",
  verificationInput: "",
};

const initialRegenerateForm: RegenerateForm = {
  password: "",
  verificationInput: "",
};

export function useTwoFactorSettings() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [disableForm, setDisableForm] =
    useState<DisableForm>(initialDisableForm);
  const [regenerateForm, setRegenerateForm] = useState<RegenerateForm>(
    initialRegenerateForm,
  );
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingAction, setLoadingAction] = useState<
    "setup" | "confirm" | "disable" | "regenerate" | null
  >(null);

  function resetFeedback() {
    setError("");
    setMessage("");
  }

  function updateDisableField<TField extends keyof DisableForm>(
    field: TField,
    value: DisableForm[TField],
  ) {
    setDisableForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateRegenerateField<TField extends keyof RegenerateForm>(
    field: TField,
    value: RegenerateForm[TField],
  ) {
    setRegenerateForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function startSetup() {
    resetFeedback();
    setRecoveryCodes([]);
    setLoadingAction("setup");

    try {
      const result = await beginTwoFactorSetup();
      setSetupData(result.data);
      setMessage("Quét QR hoặc nhập secret vào ứng dụng xác thực.");
    } catch (error) {
      setError(
        getApiErrorMessage(error, "Không thể bắt đầu thiết lập 2FA."),
      );
    } finally {
      setLoadingAction(null);
    }
  }

  async function confirmSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    setLoadingAction("confirm");

    try {
      const result = await confirmTwoFactorSetup({
        code: confirmCode.trim(),
      });

      setUser(result.data.user);
      setRecoveryCodes(result.data.recoveryCodes);
      setSetupData(null);
      setConfirmCode("");
      setMessage("2FA đã được bật. Hãy lưu recovery codes ở nơi an toàn.");
    } catch (error) {
      setError(getApiErrorMessage(error, "Mã xác thực 2FA không chính xác."));
    } finally {
      setLoadingAction(null);
    }
  }

  async function disable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
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
      setError(getApiErrorMessage(error, "Không thể tắt 2FA."));
    } finally {
      setLoadingAction(null);
    }
  }

  async function regenerateRecoveryCodes(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    setLoadingAction("regenerate");

    try {
      const result = await regenerateTwoFactorRecoveryCodes({
        password: regenerateForm.password,
        ...resolveTwoFactorVerificationInput(regenerateForm.verificationInput),
      });

      setRecoveryCodes(result.data.recoveryCodes);
      setRegenerateForm(initialRegenerateForm);
      setMessage("Recovery codes mới đã được tạo. Codes cũ không còn dùng được.");
    } catch (error) {
      setError(getApiErrorMessage(error, "Không thể tạo lại recovery codes."));
    } finally {
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
    message,
    recoveryCodes,
    regenerateForm,
    setupData,
    cancelSetup,
    confirmSetup,
    disable,
    regenerateRecoveryCodes,
    setConfirmCode,
    startSetup,
    updateDisableField,
    updateRegenerateField,
  };
}
