import { useState } from "react";
import Link from "next/link";
import { scrollAppToTop } from "@/lib/layout/use-app-scroll-to-top";
import { SidebarItemContent } from "./sidebar-item-content";
import { isActiveRoute } from "./sidebar-route";
import { useSidebarActiveItem } from "./sidebar-active-item";
import type { SidebarItem } from "./sidebar-types";
export function SidebarSection({
  title,
  items,
  pathname,
  onNavigate,
  onExternalNavigate,
}: {
  title?: string;
  items: SidebarItem[];
  pathname: string;
  onNavigate: () => void;
  onExternalNavigate?: () => void;
}) {
  const activeItemKey = useSidebarActiveItem((state) => state.key);
  const selectActiveItem = useSidebarActiveItem((state) => state.select);
  const [isPinsExpanded, setIsPinsExpanded] = useState(() =>
    items.some((item) => item.variant === "pin" && item.children?.length),
  );

  return (
    <div className="pt-0 in-[.app-container]:[--navigation-item-height:44px] min-[484px]:in-[.app-container]:[--navigation-item-height:36px]">
      {title && (
        <div className="text-(--systemSecondary) flex [font:var(--body-emphasized)] justify-between p-[15px_26px_3px] in-[.app-container]:items-end h-(--navigation-item-height) px-1.5 py-2 min-[484px]:[font:var(--callout-emphasized)] min-[484px]:m-[0_0_4px] min-[484px]:p-[4px_8px] min-[484px]:rounded-md">
          <span>{title}</span>
        </div>
      )}

      <ul className="p-0 [font:var(--title-navigation)]">
        {items.map((item) => {
          const isPin = item.variant === "pin";
          const isSelected =
            !isPin &&
            !item.external &&
            !!item.href &&
            (activeItemKey
              ? activeItemKey === item.key
              : isActiveRoute(pathname, item.href));

          return (
            <li
              key={item.key}
              onClick={
                isPin
                  ? () => setIsPinsExpanded((expanded) => !expanded)
                  : undefined
              }
              className={`[--linkHoverTextDecoration:none] rounded-md mb-0.5 p-1 relative in-[.app-container]:rounded-lg in-[.app-container]:mb-1 min-[484px]:in-[.app-container]:list-item ${isSelected ? "bg-(--navSidebarSelectedState)" : ""} ${isPin ? "h-auto" : "in-[.app-container]:h-(--navigation-item-height)"} ${isPin && isPinsExpanded ? "mb-0! pb-0!" : ""}`}
            >
              {isPin ? (
                <>
                  <span className="items-center rounded-md box-border flex -m-0.75 p-0.75 cursor-pointer in-[.app-container]:box-border in-[.app-container]:h-(--navigation-item-height)">
                    <span
                      className={`before:[border-bottom:4px_solid_transparent] before:border-e-transparent before:[border-inline-end-width:0] before:border-s-(--systemTertiary) before:[border-inline-start-width:6px] before:[border-left-style:solid] before:[border-right-style:solid] before:[border-top:4px_solid_transparent] before:content-[''] before:inline-block before:h-0 before:-inset-s-3 before:absolute before:top-4 before:transform-[rotate(0)] before:[transition:transform_.3s_ease] before:w-0 in-[.app-container]:before:-inset-s-1 in-[.app-container]:before:top-4.5 min-[484px]:in-[.app-container]:before:-inset-s-0.5 min-[484px]:in-[.app-container]:before:top-3.5 ${isPinsExpanded ? "before:transform-[rotate(90deg)]" : ""}`}
                    ></span>

                    <SidebarItemContent item={item} isSelected={false} />
                  </span>

                  {isPin && isPinsExpanded && item.children?.length && (
                    <ul
                      onClick={(e) => e.stopPropagation()}
                      className="ms-2 mt-1"
                    >
                      {item.children.map((pin) => {
                        const isPinSelected = activeItemKey
                          ? activeItemKey === pin.key
                          : isActiveRoute(pathname, pin.href);
                        return (
                          <li
                            key={pin.key}
                            className={`[--linkHoverTextDecoration:none] rounded-md mb-0.5 p-1 relative in-[.app-container]:h-(--navigation-item-height) in-[.app-container]:rounded-lg in-[.app-container]:mb-1 min-[484px]:in-[.app-container]:list-item group group/pin hover:[--playButtonOpacity:1] ${isPinSelected ? "bg-(--navSidebarSelectedState)" : ""}`}
                          >
                            <div className="block h-full">
                              <div className="[--navigation-item-icon-size:24px] [--playButtonSize:11px] h-full [-webkit-touch-callout:none]">
                                <div className="inset-0 absolute pointer-events-none"></div>
                                <SidebarItemContent
                                  item={pin}
                                  isSelected={isPinSelected}
                                  isPinItem
                                  onPinNavigate={() => {
                                    selectActiveItem(pin.key);
                                    onNavigate();
                                  }}
                                />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : item.external ? (
                <Link
                  href={item.href}
                  onClick={(event) => {
                    if (!onExternalNavigate) {
                      onNavigate();
                      return;
                    }

                    event.preventDefault();
                    onExternalNavigate();
                  }}
                  className="rounded-[inherit] box-content block h-full -m-0.75 p-0.75"
                >
                  <SidebarItemContent item={item} isSelected={false} />
                </Link>
              ) : (
                <Link
                  href={item.href!}
                  onClick={() => {
                    selectActiveItem(item.key);
                    onNavigate();
                    if (item.href === "/home") {
                      scrollAppToTop();
                    }
                  }}
                  className="rounded-[inherit] box-content block h-full -m-0.75 p-0.75"
                  aria-current={isSelected ? "page" : undefined}
                >
                  <SidebarItemContent item={item} isSelected={isSelected} />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
