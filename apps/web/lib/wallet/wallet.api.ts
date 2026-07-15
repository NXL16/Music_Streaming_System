import { http } from "@/lib/api/http";

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
  const response = await http.get<WalletBalanceResponse>("/wallet/balance");
  return response.data;
}

export async function createDepositOrder(payload: CreateDepositPayload) {
  const response = await http.post<CreateDepositResponse>("/wallet/deposit", payload);
  return response.data;
}
