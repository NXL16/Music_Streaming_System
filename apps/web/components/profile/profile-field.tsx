import type { ReactNode } from "react";

type ProfileFieldProps = {
  label: string;
  value: ReactNode;
};

export function ProfileField({ label, value }: ProfileFieldProps) {
  return (
    <div className="rounded-2xl bg-[#f5f5f7] px-5 py-4 ring-1 ring-[#e5e5ea]">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#86868b]">
        {label}
      </p>
      <div className="mt-2 wrap-break-word text-base font-semibold text-[#1d1d1f]">
        {value}
      </div>
    </div>
  );
}
