import Link from "next/link";

const localeLinks = [{ label: "Tiếng Việt", href: "#" }];

const legalLinks = [
  { label: "Internet Service Terms", href: "#" },
  { label: "Apple Music & Privacy", href: "#" },
  { label: "Cookie Warning", href: "#" },
  { label: "Support", href: "#" },
  { label: "Feedback", href: "#" },
];

export function AppFooter() {
  return (
    <div className="contents">
      <footer className="bg-(--footerBg) block shrink-0 font-sans text-[10px] font-normal tracking-normal leading-[1.3] min-h-36.75 py-(--footerVerticalPadding,15px) px-(--bodyGutter) z-(--z-default) min-[480px]:-ms-(--web-navigation-width) min-[480px]:ps-[calc(var(--web-navigation-width)+var(--bodyGutter))] min-[740px]:font-sans min-[740px]:text-[11px] min-[740px]:font-normal min-[740px]:tracking-normal min-[740px]:leading-[1.2727272727] min-[740px]:min-h-22 min-[740px]:pb-[calc(76px+var(--footerVerticalPadding,14px))] min-[740px]:pt-(--footerVerticalPadding,14px) min-[1680px]:content-start min-[1680px]:items-baseline min-[1680px]:[display:var(--footerDisplay,flex)] min-[1680px]:justify-between">
        <div className="[--linkColor:var(--systemSecondary)] font-sans order-1 min-[740px]:order-2">
          <div className="flex mb-6.25">
            <button className="link text-[hsla(0,0%,100%,.92)] inline-flex leading-none mt-1.5 align-middle whitespace-nowrap">
              Vietnam
            </button>

            <ul className="flex flex-wrap ps-2.5">
              {localeLinks.map((link) => (
                <li
                  key={link.label}
                  className="inline-flex leading-none mt-1.5 align-middle before:content-[''] [border-inline-start:1px_solid_var(--systemQuaternary)] before:h-full"
                >
                  <Link
                    href={link.href}
                    className="[--linkColor:var(--systemSecondary)] pe-2.5 whitespace-nowrap ps-2.5"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="min-[740px]:order-1">
          <p className="text-(--systemSecondary) mb-1.25">
            <span dir="ltr">
              <span dir="auto">Copyright © 2026</span>
              <Link
                href="#"
                className="[--linkColor:var(--systemPrimary)] ms-0.75"
              >
                <span dir="auto">Apple Inc.</span>
              </Link>
            </span>
            <span dir="auto" className="ms-0.75">
              All rights reserved.
            </span>
          </p>

          <ul className="flex flex-wrap">
            {legalLinks.map((link, index) => {
              const isLast = index === legalLinks.length - 1;

              return (
                <li
                  key={link.label}
                  className={[
                    "inline-flex leading-none mt-1.5 align-middle",
                    !isLast &&
                      "after:content-[''] after:inline-block after:[border-inline-start:1px_solid_var(--systemQuaternary)] after:pe-2.5",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Link href={link.href} className="h-full pe-2.5">
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </footer>
    </div>
  );
}
