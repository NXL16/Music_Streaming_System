import {
  CSSProperties,
  ElementType,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useMenuStore } from "@/lib/menu/use-menu-store";
import type { MenuItemData } from "@/lib/menu/use-menu-store";
import M404ContextualMenu from "./m404-contextual-menu";

const M404CustomTag = "m404-contextual-menu-item" as ElementType;

type M404ContextualMenuItemProps = {
  item: MenuItemData;
};

const LI_STYLES = {
  "--ctxmenu-submenu-min-width": "185px",
  "--ctxmenu-submenu-max-width": "350px",
  "--ctxmenu-submenu-max-height": "350px",
} as CSSProperties;

export default function M404ContextualMenuItem({
  item,
}: M404ContextualMenuItemProps) {
  const router = useRouter();
  const closeMenu = useMenuStore((s) => s.closeMenu);
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const hasChildren = Boolean(
    item.children?.length || item.recentItems || item.loadRecentItems,
  );

  const openSubmenu = () => {
    setIsSubmenuOpen(true);
  };

  const handleClick = () => {
    if (hasChildren) {
      openSubmenu();
      return;
    }

    if (item.href) {
      router.push(item.href);
    } else {
      item.onClick?.();
    }
    if (!item.keepOpen) closeMenu();
  };

  const itemRef = useRef<HTMLLIElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [submenuSide, setSubmenuSide] = useState<"left" | "right">("right");
  const [submenuTop, setSubmenuTop] = useState(0);

  useLayoutEffect(() => {
    if (!isSubmenuOpen || !itemRef.current || !submenuRef.current) return;

    const parentRect = itemRef.current.getBoundingClientRect();
    const submenuWidth = submenuRef.current.offsetWidth;
    const menuRect = itemRef.current
      .closest(".contextual-menu")
      ?.getBoundingClientRect();

    const spaceOnRight = window.innerWidth - parentRect.right;
    const spaceOnLeft = parentRect.left;

    setSubmenuSide(
      spaceOnRight >= submenuWidth || spaceOnRight >= spaceOnLeft
        ? "right"
        : "left",
    );
    setSubmenuTop(menuRect ? Math.round(parentRect.top - menuRect.top) : 0);
  }, [isSubmenuOpen]);

  const submenuStyles = {
    "--ctxmenu-submenu-left": submenuSide === "right" ? "100%" : "initial",
    "--ctxmenu-submenu-right": submenuSide === "left" ? "100%" : "initial",
    "--ctxmenu-submenu-top": `${submenuTop}px`,
    "--ctxmenu-submenu-bottom": "auto",
  } as CSSProperties;

  return (
    <M404CustomTag
      hydrated=""
      data-menu-id={item.id}
      style={hasChildren ? submenuStyles : undefined}
    >
      <li
        ref={itemRef}
        className="contextual-menu-item"
        style={hasChildren ? LI_STYLES : undefined}
        onMouseEnter={hasChildren ? openSubmenu : undefined}
        onMouseLeave={hasChildren ? () => setIsSubmenuOpen(false) : undefined}
      >
        <button
          title={item.label}
          type="button"
          onClick={handleClick}
          disabled={item.disabled}
          aria-haspopup={hasChildren ? "menu" : undefined}
          aria-expanded={hasChildren ? isSubmenuOpen : undefined}
          onFocus={hasChildren ? openSubmenu : undefined}
        >
          <span className="contextual-menu-item__option-wrapper">
            <span className="contextual-menu-item__option-text">
              {item.label}
            </span>
            <span className="contextual-menu-item__option-text contextual-menu-item__option-text--after"></span>

            {item.icon && (
              <span className="contextual-menu-item__icon-container">
                {item.icon}
              </span>
            )}
          </span>
        </button>

        {hasChildren && (
          <div
            ref={submenuRef}
            className="contextual-menu-item--nested"
            data-open={isSubmenuOpen ? "" : undefined}
          >
            <M404ContextualMenu
              nested
              items={item.children}
              recentItems={item.recentItems}
              title={item.label}
            />
          </div>
        )}
      </li>
    </M404CustomTag>
  );
}
