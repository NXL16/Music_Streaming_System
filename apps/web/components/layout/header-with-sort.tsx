import M404SortButton from "../custom-elements/m404-sort-menu-button";
import type {
  LibrarySortBy,
  SortDirection,
} from "../custom-elements/m404-sort-menu-button";

type HeaderWithSortProps = {
  title: string;
  sortBy?: LibrarySortBy;
  direction?: SortDirection;
  onSortByChange?: (sortBy: LibrarySortBy) => void;
  onDirectionChange?: (direction: SortDirection) => void;
  showSort?: boolean;
};

export default function HeaderWithSort({
  title,
  sortBy,
  direction,
  onSortByChange,
  onDirectionChange,
  showSort = true,
}: HeaderWithSortProps) {
  return (
    <div className="ms-(--bodyGutter) pb-[0.5px] grid grid-cols-[1fr_auto] items-center h-9.5 -mb-3 me-6.25 pt-0 min-[484px]:me-3.75 min-[1000px]:me-5 min-[1000px]:mt-1">
      <h1 className="col-1 row-1 me-0 text-center text-(--systemPrimary) [font:var(--title-3-emphasized)]">
        {title}
      </h1>

      {showSort && (
        <div className="col-2 row-1 inset-e-0">
          <div className="[--linkColor:var(--keyColor)] inline-block [font:var(--title-3)] z-[calc(var(--z-default))+1]">
            <M404SortButton
              sortBy={sortBy}
              direction={direction}
              onSortByChange={onSortByChange}
              onDirectionChange={onDirectionChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
