"use client";

import { useRouter } from "next/navigation";
import type { MediaCardProps } from "@/components/media/media-card.types";
import { SearchMediaSuggestionLockup } from "./search-media-suggestion-lockup";

type MobileSearchMediaListProps = {
  items: MediaCardProps[];
};

export function MobileSearchMediaList({ items }: MobileSearchMediaListProps) {
  const router = useRouter();

  return (
    <ul aria-label="Suggestions" className="search-suggestions" role="listbox">
      {items.map((card) => (
        <li
          aria-selected={false}
          className="search-hint search-hint--lockup"
          key={`${card.resourceType}-${card.id}`}
          onClick={() => {
            card.onOpen?.();
            if (card.slug) router.push(card.slug);
          }}
          role="option"
          tabIndex={-1}
        >
          <SearchMediaSuggestionLockup card={card} showMobileActions />
        </li>
      ))}
    </ul>
  );
}
