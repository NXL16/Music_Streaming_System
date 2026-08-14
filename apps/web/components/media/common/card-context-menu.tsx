import { memo } from "react";
import AmpContextMenuButton from "@/components/custom-elements/AmpContextMenuButton";
import type { MenuItemData } from "@/lib/menu/use-menu-store";
import type { ContextMenuContext } from "@/lib/context-menu/types";

type CardContextMenuProps = {
  id?: string;
  items?: MenuItemData[];
  context?: ContextMenuContext;
};

const CardContextMenu = memo(function CardContextMenu({
  id,
  items,
  context,
}: CardContextMenuProps) {
  return (
    <div className="media-card-context-menu bottom-2.5 inset-e-2.5 leading-0 absolute z-(--z-default)">
      <div slot="context-button">
        <AmpContextMenuButton
          id={id}
          items={items}
          context={context}
          hasPlatter
          className="more-button--material"
        />
      </div>
    </div>
  );
});

export default CardContextMenu;
