import { http } from "@/lib/api/http";
import {
  getCachedQuery,
  getCachedQuerySnapshot,
  invalidateCachedQuery,
  setCachedQuery,
} from "@/lib/api/query-cache";

const WALLET_BALANCE_KEY = "wallet:balance";
const WALLET_BALANCE_TTL_MS = 30_000;
const WITHDRAW_STATUS_KEY = "wallet:withdraw-status";
const WITHDRAW_STATUS_TTL_MS = 5 * 60_000;

export type WalletBalanceResponse = {
  coinBalance: number;
  frozenBalance: number;
};

export type BankAccount = {
  id: string;
  userId: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  isDefault: boolean;
};

export type GetWithdrawStatusResponse = {
  isPinSet: boolean;
  bankAccounts: BankAccount[];
};

export type CreateDepositResponse = {
  orderId: string;
  paymentUrl: string;
};

export type CreateDepositPayload = {
  amountVnd: number;
  paymentMethod: "MOMO" | "NFBANK";
};

export type VerifyNFBankAccountResponse = { accountName: string };
export type CreateNFBankWithdrawalResponse = {
  orderId: string;
  status: "SUCCESS" | "FAILED" | "PROCESSING" | "PENDING";
  coinAmount: number;
  transactionId: string;
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

export async function refreshWalletBalance() {
  invalidateCachedQuery(WALLET_BALANCE_KEY);
  return getWalletBalance();
}

export function getWithdrawStatusSnapshot() {
  return getCachedQuerySnapshot<GetWithdrawStatusResponse>(WITHDRAW_STATUS_KEY);
}

export function cacheWithdrawStatus(data: GetWithdrawStatusResponse) {
  setCachedQuery(WITHDRAW_STATUS_KEY, data, WITHDRAW_STATUS_TTL_MS);
}

export function getWithdrawStatus() {
  return getCachedQuery(
    WITHDRAW_STATUS_KEY,
    async (signal) =>
      (
        await http.get<GetWithdrawStatusResponse>("/wallet/withdraw/status", {
          signal,
        })
      ).data,
    WITHDRAW_STATUS_TTL_MS,
  );
}

export async function setWithdrawPin(pin: string) {
  const response = (
    await http.post<{ success: boolean }>("/wallet/withdraw/pin", { pin })
  ).data;
  invalidateCachedQuery(WITHDRAW_STATUS_KEY);
  return response;
}

export async function linkBankAccount(payload: {
  accountNumber: string;
  pin: string;
  bankCode?: string;
}) {
  const response = (
    await http.post<BankAccount>("/wallet/bank-accounts/link", payload)
  ).data;
  invalidateCachedQuery(WITHDRAW_STATUS_KEY);
  return response;
}

export async function createDepositOrder(payload: CreateDepositPayload) {
  const response = await http.post<CreateDepositResponse>(
    "/wallet/deposit",
    payload,
  );
  return response.data;
}

export async function verifyNFBankAccount(accountNumber: string) {
  return (
    await http.post<VerifyNFBankAccountResponse>(
      "/wallet/withdraw/nfbank/verify-account",
      { accountNumber },
    )
  ).data;
}

export async function createNFBankWithdrawal(payload: {
  pin: string;
  amountVnd: number;
  idempotencyKey: string;
  bankAccountId?: string;
  accountNumber?: string;
}) {
  const response = await http.post<CreateNFBankWithdrawalResponse>(
    "/wallet/withdraw/nfbank",
    payload,
  );
  invalidateCachedQuery(WALLET_BALANCE_KEY);
  return response.data;
}

export type CoinRate = { amountVnd: number; coinAmount: number };
export type PaymentKind = "DEPOSIT" | "WITHDRAWAL";
export type PaymentOrder = {
  orderId: string;
  kind: PaymentKind;
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
  amountVnd: number;
  coinAmount: number;
  provider: string;
  createdAt: number;
};
export async function getCoinRate(signal?: AbortSignal) {
  return (await http.get<CoinRate>("/wallet/coin-rate", { signal })).data;
}
export async function getPaymentOrder(
  kind: PaymentKind,
  reference: string,
  signal?: AbortSignal,
) {
  return (
    await http.get<PaymentOrder>(
      "/wallet/orders/" + kind + "/" + encodeURIComponent(reference),
      { signal, timeout: 40_000 },
    )
  ).data;
}

export type WalletTransactionKind = "ALL" | PaymentKind;
export type WalletTransactionHistoryResponse = {
  items: PaymentOrder[];
  hasMore: boolean;
};

export async function getWalletTransactionHistory(
  params: {
    kind?: WalletTransactionKind;
    limit?: number;
    offset?: number;
  },
  signal?: AbortSignal,
) {
  return (
    await http.get<WalletTransactionHistoryResponse>("/wallet/transactions", {
      params: {
        kind: params.kind ?? "ALL",
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
      },
      signal,
    })
  ).data;
}
