import type { ReactNode } from "react";

type AuthPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  narrow?: boolean;
};

export function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
  narrow = false,
}: AuthPageShellProps) {
  if (narrow) {
    return (
      <main className="min-h-screen bg-[#f5f5f7] px-6 py-10 text-[#1d1d1f]">
        <section className="mx-auto max-w-md rounded-3xl bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-[#e5e5ea]">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#fa233b]">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.045em] text-[#1d1d1f]">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#6e6e73]">{description}</p>
          {children}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f5f7] px-6 py-10 text-[#1d1d1f]">
      <section className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_420px]">
        <div className="flex flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#fa233b]">
            {eyebrow}
          </p>
          <h1 className="mt-5 max-w-xl text-5xl font-bold leading-tight tracking-[-0.055em] text-[#1d1d1f] md:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-[#6e6e73]">
            {description}
          </p>
        </div>

        <div className="rounded-3xl bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-[#e5e5ea]">
          {children}
        </div>
      </section>
    </main>
  );
}
