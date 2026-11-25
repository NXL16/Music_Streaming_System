import { beforeEach, expect, it, vi } from "vitest";
import { AxiosError, type AxiosAdapter } from "axios";
import { http } from "./http";
import { refreshAccessToken } from "@/lib/auth/session-refresh";

vi.mock("@/lib/auth/access-token-store", () => ({
  getAccessToken: () => null,
}));
vi.mock("@/lib/auth/session-refresh", () => ({ refreshAccessToken: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it("does not refresh a session when a public email verification token is rejected", async () => {
  const adapter: AxiosAdapter = vi.fn(async (config) => {
    throw new AxiosError(
      "Expired token",
      "ERR_BAD_REQUEST",
      config,
      undefined,
      {
        status: 401,
        statusText: "Unauthorized",
        data: {},
        headers: {},
        config,
      },
    );
  });
  await expect(
    http.post(
      "/auth/email/verify",
      { token: "expired-test-token" },
      { adapter },
    ),
  ).rejects.toMatchObject({ response: { status: 401 } });
  expect(adapter).toHaveBeenCalledOnce();
  expect(refreshAccessToken).not.toHaveBeenCalled();
});

it("still refreshes an expired access token for protected requests", async () => {
  vi.mocked(refreshAccessToken).mockResolvedValue({
    accessToken: "fresh-test-token",
  } as never);
  const adapter: AxiosAdapter = vi.fn(async (config) => {
    if (config.headers.Authorization !== "Bearer fresh-test-token")
      throw new AxiosError(
        "Expired session",
        "ERR_BAD_REQUEST",
        config,
        undefined,
        {
          status: 401,
          statusText: "Unauthorized",
          data: {},
          headers: {},
          config,
        },
      );
    return { status: 200, statusText: "OK", data: {}, headers: {}, config };
  });
  await expect(http.get("/auth/me", { adapter })).resolves.toMatchObject({
    status: 200,
  });
  expect(adapter).toHaveBeenCalledTimes(2);
  expect(refreshAccessToken).toHaveBeenCalledOnce();
});
