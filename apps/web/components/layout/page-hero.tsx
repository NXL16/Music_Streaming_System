import type { ReactNode } from "react";

type PageHeroProps = {
  eyebrow: string;
  title: ReactNode;
  description: string;
  actions?: ReactNode;
  leading?: ReactNode;
  children?: ReactNode;
};

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  leading,
  children,
}: PageHeroProps) {
  return (
    <div className="rounded-3xl bg-white dark:bg-white/5 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-none ring-1 ring-[#e5e5ea] dark:ring-white/10 md:p-8">
      <div className="flex flex-col gap-6 lg:fleextow lg:items-center lg:justify-between">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {leading}

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#fa233b]">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-4xl font-bold leading-tight tracking-[-0.055em] text-[#1d1d1f] dark:text-white md:text-6xl">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-[17px] leading-7 text-[#6e6e73] dark:text-neutral-400">
              {description}
            </p>
          </div>
        </div>

        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
      </div>

      {children}
    </div>
  );
}
