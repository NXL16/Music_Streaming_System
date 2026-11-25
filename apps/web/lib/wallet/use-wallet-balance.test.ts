import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { useWalletBalance } from "./use-wallet-balance";
import { refreshWalletBalance } from "./wallet.api";

vi.mock("./wallet.api", () => ({
  getWalletBalance: vi.fn(),
  refreshWalletBalance: vi.fn(),
}));
vi.mock("@/lib/auth/auth-store", () => {
  const session = { status: "authenticated", user: { userId: "payer" } };
  return {
    useAuthStore: Object.assign(
      (select: (state: typeof session) => unknown) => select(session),
      { getState: () => session },
    ),
  };
});
vi.mock("@/lib/loading/use-minimum-loading-duration", () => ({
  useMinimumLoadingState: () => [false, vi.fn()],
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("queues a payment completion refresh while another balance request is running", async () => {
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal(
    "CustomEvent",
    class {
      constructor(
        public type: string,
        public options: unknown,
      ) {}
    },
  );
  let resolve!: (value: { coinBalance: number; frozenBalance: number }) => void;
  vi.mocked(refreshWalletBalance).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  vi.mocked(refreshWalletBalance).mockResolvedValue({
    coinBalance: 150,
    frozenBalance: 0,
  });
  let wallet!: ReturnType<typeof useWalletBalance>;
  function Probe() {
    wallet = useWalletBalance();
    return null;
  }
  renderToString(createElement(Probe));
  wallet.refreshBalanceWithLoading();
  wallet.refreshBalance();
  expect(refreshWalletBalance).toHaveBeenCalledTimes(1);
  resolve({ coinBalance: 100, frozenBalance: 0 });
  await vi.waitFor(() => expect(refreshWalletBalance).toHaveBeenCalledTimes(2));
});
