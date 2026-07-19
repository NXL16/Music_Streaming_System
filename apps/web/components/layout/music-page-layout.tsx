import type { ReactNode } from "react";

export function MusicPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3">
      <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
        <div className="flex pt-3 in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div className="min-[1000px]:flex-1 min-[1000px]:-ms-5 min-[1000px]:min-w-0 w-full">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MusicPageHeading({
  title,
  trailing,
}: {
  title: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="items-center flex justify-end m-[0_var(--bodyGutter)_13px]">
      <div className="flex-1">
        <h1 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
          {title}
        </h1>
      </div>
      {trailing}
    </header>
  );
}

export function MusicPageSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="box-border p-[0_var(--shelfGridPaddingInline,var(--bodyGutter))] pb-8 relative w-full z-(--z-default)"
    >
      <div className="items-center flex justify-end m-[0_0_13px]">
        <div className="flex-1">
          <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
            {title}
          </h2>
        </div>
      </div>
      {children}
    </section>
  );
}
