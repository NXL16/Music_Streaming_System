import { ElementType, useId } from "react";
import { useMenuStore, type MenuItemData } from "@/lib/menu/use-menu-store";

const M404CustomTag = "m404-sort-menu-button" as ElementType;

export type LibrarySortBy = "title" | "recently-added";
export type SortDirection = "ascending" | "descending";

type M404SortButtonProps = {
  sortBy?: LibrarySortBy;
  direction?: SortDirection;
  onSortByChange?: (sortBy: LibrarySortBy) => void;
  onDirectionChange?: (direction: SortDirection) => void;
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16">
      <path d="M6.9 12.9c.3 0 .5-.1.7-.4l5.3-8.4c.1-.1.1-.3.1-.4 0-.4-.2-.6-.6-.6-.3 0-.4.1-.6.3l-5 8-2.6-3.5c-.2-.2-.3-.3-.6-.3s-.6.2-.6.6c0 .2.1.3.2.5l3 3.9c.2.2.4.3.7.3z"></path>
    </svg>
  );
}

export default function M404SortButton({
  sortBy,
  direction,
  onSortByChange,
  onDirectionChange,
}: M404SortButtonProps) {
  const openMenu = useMenuStore((state) => state.openMenu);
  const closeMenu = useMenuStore((state) => state.closeMenu);
  const menuId = useId();
  const isMenuOpen = useMenuStore(
    (state) => state.isOpen && state.activeId === menuId,
  );
  const isInteractive = Boolean(onSortByChange && onDirectionChange);

  const menuItems: MenuItemData[] = isInteractive
    ? [
        {
          id: "sort-title",
          label: "Title",
          icon: sortBy === "title" ? <CheckIcon /> : undefined,
          onClick: () => onSortByChange?.("title"),
        },
        {
          id: "sort-recently-added",
          label: "Recently Added",
          icon: sortBy === "recently-added" ? <CheckIcon /> : undefined,
          onClick: () => onSortByChange?.("recently-added"),
        },
        {
          id: "sort-ascending",
          label: "Ascending",
          icon: direction === "ascending" ? <CheckIcon /> : undefined,
          onClick: () => onDirectionChange?.("ascending"),
        },
        {
          id: "sort-descending",
          label: "Descending",
          icon: direction === "descending" ? <CheckIcon /> : undefined,
          onClick: () => onDirectionChange?.("descending"),
        },
      ]
    : [];

  return (
    <M404CustomTag hydrated="">
      <button
        type="button"
        className="contextual-menu__trigger"
        aria-expanded={isInteractive ? isMenuOpen : undefined}
        aria-haspopup={isInteractive ? "menu" : undefined}
        onClick={(event) => {
          if (!isInteractive) return;
          if (isMenuOpen) {
            closeMenu();
            return;
          }
          openMenu({ id: menuId, items: menuItems }, event.currentTarget);
        }}
      >
        <span className="items-center flex h-7 justify-center min-w-7">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="fill-(--systemSecondary)"
          >
            <path d="M3.644 1.78.191 5.3A.7.7 0 0 0 0 5.752c0 .362.246.608.602.608a.58.58 0 0 0 .43-.178l1.423-1.47 1.1-1.271-.068 1.58v8.785c0 .363.253.616.616.616.355 0 .608-.253.608-.616V5.02L4.65 3.44l1.094 1.272 1.429 1.47a.56.56 0 0 0 .424.178c.355 0 .601-.246.601-.608a.67.67 0 0 0-.191-.452L4.56 1.78a.614.614 0 0 0-.917 0zm8.718 12.444 3.447-3.536a.64.64 0 0 0 .191-.45c0-.363-.246-.603-.602-.603a.56.56 0 0 0-.424.171l-1.422 1.47-1.1 1.28.06-1.58V2.189a.59.59 0 0 0-.608-.615.59.59 0 0 0-.615.615v8.787l.068 1.58-1.1-1.28-1.423-1.47a.57.57 0 0 0-.424-.17c-.355 0-.608.239-.608.601a.65.65 0 0 0 .198.451l3.446 3.536a.62.62 0 0 0 .916 0"></path>
          </svg>

          <svg
            xmlns="http://www.w3.org/2000/svg"
            fillRule="evenodd"
            strokeLinejoin="round"
            strokeMiterlimit="2"
            clipRule="evenodd"
            viewBox="0 0 9 5"
            className="fill-(--systemSecondary) h-1.25 ps-2.5 max-[483px]:hidden"
            aria-hidden="true"
          >
            <path
              fillRule="nonzero"
              d="M8.836.982 4.909 4.745a.62.62 0 0 1-.409.164.62.62 0 0 1-.409-.164L.164.982A.63.63 0 0 1 0 .573C0 .245.245 0 .573 0 .736 0 .9.082.982.164L4.5 3.518 8.018.164A.63.63 0 0 1 8.427 0C8.755 0 9 .245 9 .573a.63.63 0 0 1-.164.409"
            ></path>
          </svg>
        </span>
      </button>
    </M404CustomTag>
  );
}
