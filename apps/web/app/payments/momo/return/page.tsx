"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function PaymentReturnContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const resultCode = searchParams.get("resultCode");
  const orderId = searchParams.get("orderId");
  const amount = searchParams.get("amount") || "0";

  const status =
    resultCode === "0" ? "success" : resultCode ? "failed" : "processing";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 text-neutral-100 px-4">
      <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 p-8 rounded-2xl shadow-xl text-center">
        {/* TRẠNG THÁI ĐANG XỬ LÝ */}
        {status === "processing" && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">
              Đang xác thực giao dịch...
            </h2>
            <p className="text-sm text-neutral-400">
              Vui lòng giữ kết nối, hệ thống đang đồng bộ hóa dòng tiền.
            </p>
          </div>
        )}

        {/* THÀNH CÔNG */}
        {status === "success" && (
          <div className="space-y-6">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full flex items-center justify-center text-3xl mx-auto">
              ✓
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-emerald-400">
                Nạp Tiền Thành Công!
              </h2>
              <p className="text-sm text-neutral-400">
                Coin đã được nạp trực tiếp vào ví hệ thống nhạc của bạn.
              </p>
            </div>

            <div className="bg-neutral-950 p-4 rounded-xl text-left text-sm space-y-2 border border-neutral-800">
              <div className="flex justify-between">
                <span className="text-neutral-500">Mã đơn hàng:</span>
                <span className="font-mono font-medium text-neutral-300">
                  {orderId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Số tiền:</span>
                <span className="font-bold text-pink-500">
                  {Number(amount).toLocaleString()} VND
                </span>
              </div>
            </div>

            <button
              onClick={() => router.push("/home")}
              className="w-full bg-pink-600 hover:bg-pink-700 text-white font-medium py-3 rounded-xl transition-all"
            >
              Quay lại Trang chủ nghe nhạc
            </button>
          </div>
        )}

        {/* THẤT BẠI */}
        {status === "failed" && (
          <div className="space-y-6">
            <div className="w-16 h-16 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-full flex items-center justify-center text-3xl mx-auto">
              ✕
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-rose-400">
                Giao Dịch Thất Bại
              </h2>
              <p className="text-sm text-neutral-400">
                Yêu cầu thanh toán của bạn đã bị hủy hoặc không thể hoàn tất.
              </p>
            </div>

            <div className="bg-neutral-950 p-4 rounded-xl text-left text-sm space-y-2 border border-neutral-800">
              <div className="flex justify-between">
                <span className="text-neutral-500">Mã đơn hàng:</span>
                <span className="font-mono text-neutral-400">{orderId}</span>
              </div>
            </div>

            <div className="text-left text-xs bg-pink-950/20 border border-pink-800/20 text-pink-400 p-4 rounded-xl space-y-1">
              <p className="font-bold">💡 Môi trường thử nghiệm (Sandbox):</p>
              <p>
                Nếu ví nhạc của bạn ở thanh bên (sidebar) đã được cộng số dư thành công, điều này có nghĩa là cổng thanh toán đã gửi Webhook thành công. Bạn có thể bỏ qua thông báo lỗi chuyển hướng này của ví điện tử.
              </p>
            </div>

            <div className="flex gap-3">
              <Link
                href="/home"
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium py-3 rounded-xl text-center transition-all text-sm"
              >
                Trang chủ
              </Link>
              <button
                onClick={() => router.push("/deposit")} // Định tuyến về trang nạp tiền của bạn
                className="flex-1 bg-pink-600 hover:bg-pink-700 text-white font-medium py-3 rounded-xl transition-all text-sm"
              >
                Thử nạp lại
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MomoReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-neutral-950 text-neutral-100">
        </div>
      }
    >
      <PaymentReturnContent />
    </Suspense>
  );
}
