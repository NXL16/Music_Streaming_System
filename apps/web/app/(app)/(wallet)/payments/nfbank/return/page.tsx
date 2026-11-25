import { Suspense } from "react";
import { PaymentReturn } from "@/components/wallet/payment-return";
export default function NfbankReturnPage() {
  return (
    <Suspense fallback={null}>
      <PaymentReturn />
    </Suspense>
  );
}
