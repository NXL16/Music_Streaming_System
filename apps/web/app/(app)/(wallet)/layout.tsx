import type { ReactNode } from "react";
import { WalletLayout } from "@/components/wallet/wallet-layout";

export default function Layout({ children }: { children: ReactNode }) {
  return <WalletLayout>{children}</WalletLayout>;
}
