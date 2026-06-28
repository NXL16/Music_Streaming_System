import AmpContextMenuButton from "@/components/custom-elements/AmpContextMenuButton";

export default function CardContextMenu() {
  return (
    <div className="bottom-2.5 inset-e-2.5 leading-0 absolute z-(--z-default)">
      <div slot="context-button">
        <AmpContextMenuButton isHover={true} />
      </div>
    </div>
  );
}
