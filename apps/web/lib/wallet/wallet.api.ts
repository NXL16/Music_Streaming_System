import { http } from "@/lib/api/http";
import { getCachedQuery, invalidateCachedQuery } from "@/lib/api/query-cache";

const WALLET_BALANCE_KEY = "wallet:balance";
const WALLET_BALANCE_TTL_MS = 30_000;

export type WalletBalanceResponse = {
  coinBalance: number;
  frozenBalance: number;
};

export type CreateDepositResponse = {
  orderId: string;
  paymentUrl: string;
};

export type CreateDepositPayload = {
  amountVnd: number;
  paymentMethod: "MOMO" | "NFBANK";
};

export async function getWalletBalance() {
  return getCachedQuery(
    WALLET_BALANCE_KEY,
    async (signal) =>
      (await http.get<WalletBalanceResponse>("/wallet/balance", { signal }))
        .data,
    WALLET_BALANCE_TTL_MS,
  );
}

export async function createDepositOrder(payload: CreateDepositPayload) {
  const response = await http.post<CreateDepositResponse>(
    "/wallet/deposit",
    payload,
  );
  invalidateCachedQuery(WALLET_BALANCE_KEY);
  return response.data;
}
