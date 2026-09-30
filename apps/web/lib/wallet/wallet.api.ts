import { http } from "@/lib/api/http";
import { getCachedQuery, invalidateCachedQuery } from "@/lib/api/query-cache";

const WALLET_BALANCE_KEY = "wallet:balance";
const WALLET_BALANCE_TTL_MS = 30_000;

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

export async function getWithdrawStatus() {
  return (await http.get<GetWithdrawStatusResponse>("/wallet/withdraw/status")).data;
}

export async function setWithdrawPin(pin: string) {
  return (await http.post<{ success: boolean }>("/wallet/withdraw/pin", { pin })).data;
}

export async function linkBankAccount(payload: { accountNumber: string; pin: string; bankCode?: string }) {
  return (await http.post<BankAccount>("/wallet/bank-accounts/link", payload)).data;
}

export async function createDepositOrder(payload: CreateDepositPayload) {
  const response = await http.post<CreateDepositResponse>(
    "/wallet/deposit",
    payload,
  );
  invalidateCachedQuery(WALLET_BALANCE_KEY);
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
