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
    <div className="rounded-[28px] border border-(--labelDivider) bg-(--glassMaterialBackground) p-6 shadow-[0_18px_50px_var(--glassMaterialShadowColor)] backdrop-blur-xl md:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {leading}

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#fa233b]">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-4xl tracking-[-0.045em] text-(--systemPrimary) [font:var(--large-title-emphasized-short)] md:text-5xl">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-[17px] leading-7 text-(--systemSecondary)">
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
