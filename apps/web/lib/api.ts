import { env } from "./env";

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${env.apiUrl}/${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options?.headers || {}),
    },

    cache: "no-store",
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || "Request failed");
  }
  return res.json();
}
