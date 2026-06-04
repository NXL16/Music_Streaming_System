import { AxiosError } from "axios";

type ApiErrorBody = {
  success?: boolean;
  code?: string;
  message?: string | string[];
};

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiErrorBody | undefined;
    const message = data?.message;

    if (Array.isArray(message)) {
      return message[0] ?? fallback;
    }

    return message ?? fallback;
  }

  return fallback;
}
