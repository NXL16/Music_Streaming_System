import Link from "next/link";

type ActionCardProps = {
  href: string;
  label: string;
  title: string;
  description: string;
  actionLabel?: string;
};

export function ActionCard({
  href,
  label,
  title,
  description,
  actionLabel = "Open",
}: ActionCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-[#e5e5ea] transition hover:-translate-y-0.5 hover:ring-[#fa233b]/40 md:p-8"
    >
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#fa233b]">
        {label}
      </p>
      <h2 className="mt-3 text-3xl font-bold tracking-[-0.045em] text-[#1d1d1f]">
        {title}
      </h2>
      <p className="mt-3 leading-7 text-[#6e6e73]">{description}</p>
      <span className="mt-6 inline-flex rounded-full bg-[#f2f2f7] px-5 py-2.5 text-sm font-bold text-[#1d1d1f] transition group-hover:bg-[#fa233b] group-hover:text-white">
        {actionLabel}
      </span>
    </Link>
  );
}
