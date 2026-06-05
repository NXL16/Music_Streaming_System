"use client";

import { useVerifyEmail } from "@/lib/auth/use-verify-email";

export default function VerifyEmailPage() {
  const { status, message, redirecting } = useVerifyEmail();

  const title =
    status === "success"
      ? "Email đã được xác thực"
      : status === "error"
        ? "Không thể xác thực email"
        : "Đang xác thực email";

  return (
    <main className="min-h-screen bg-[#f7efe5] px-6 py-10 text-[#23170f]">
      <section className="mx-auto max-w-2xl rounded-4xl border border-[#ead4bd] bg-white p-8 shadow-[0_24px_80px_rgba(95,55,25,0.12)]">
        <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#b65f38]">
          Email Verification
        </p>

        <h1 className="mt-4 text-4xl font-black">{title}</h1>

        <p className="mt-4 leading-7 text-[#705846]">
          {message ||
            "Vui lòng đợi trong giây lát để hệ thống kiểm tra token xác thực."}
        </p>

        {redirecting ? (
          <p className="mt-3 text-sm font-semibold text-[#b65f38]">
            Hệ thống sẽ tự chuyển bạn về hồ sơ.
          </p>
        ) : null}
      </section>
    </main>
  );
}
