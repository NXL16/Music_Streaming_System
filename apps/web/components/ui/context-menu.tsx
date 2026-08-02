"use client";

import {
  cloneElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem =
  | {
      id: string;
      label: string;
      onSelect: () => void;
      icon?: ReactNode;
      disabled?: boolean;
      tone?: "default" | "destructive";
    }
  | {
      id: string;
      type: "separator";
    };

type ContextMenuProps = {
  children: ReactElement<{
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  }>;
  items: ContextMenuItem[];
};

export function ContextMenu({ children, items }: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setPosition({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePosition();
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <div ref={triggerRef} className="inline-flex">
      {cloneElement(children, {
        onClick: (event: MouseEvent<HTMLButtonElement>) => {
          children.props.onClick?.(event);
          if (!event.defaultPrevented) setOpen((isOpen) => !isOpen);
        },
      })}

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="bg-(--systemBackground,#fff) border border-(--systemQuaternary) min-w-50 overflow-hidden rounded-lg shadow-[0_8px_24px_rgba(0,0,0,.18)] fixed py-1 z-[calc(var(--z-web-chrome)+3)]"
            style={position}
          >
            {items.map((item) => {
              if ("type" in item) {
                return (
                  <div
                    key={item.id}
                    role="separator"
                    className="bg-(--systemQuaternary) h-px my-1"
                  />
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  className={`flex gap-3 hover:bg-(--systemQuaternary) items-center px-3 py-2 text-left w-full ${
                    item.tone === "destructive"
                      ? "text-(--systemRed,#ff3b30)"
                      : "text-(--systemPrimary)"
                  } disabled:cursor-default disabled:opacity-40`}
                >
                  <span className="flex items-center justify-center size-4">
                    {item.icon}
                  </span>
                  <span className="[font:var(--body)]">{item.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
