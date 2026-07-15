import { memo } from "react";
import AmpContextMenuButton from "@/components/custom-elements/AmpContextMenuButton";

const CardContextMenu = memo(function CardContextMenu() {
  return (
    <div className="media-card-context-menu bottom-2.5 inset-e-2.5 leading-0 absolute z-(--z-default)">
      <div slot="context-button">
        <AmpContextMenuButton isHover />
      </div>
    </div>
  );
});

export default CardContextMenu;
