"use client";

import { useState } from "react";
import type { MediaCardProps } from "@/components/media/media-card.types";
import type { SearchResults as SearchResultsData } from "@/lib/catalog/search.mapper";
import { MobileSearchMediaList } from "./mobile-search-media-list";

type MobileSearchTab =
  | "top-results"
  | "artists"
  | "albums"
  | "songs"
  | "playlists"
  | "music-videos";

type SearchResultsMobileProps = {
  results: SearchResultsData;
  shelfResults: SearchResultsData;
};

type TabDefinition = {
  id: MobileSearchTab;
  label: string;
  items: MediaCardProps[];
};

export default function SearchResultsMobile({
  results,
  shelfResults,
}: SearchResultsMobileProps) {
  const allTabs: TabDefinition[] = [
    { id: "top-results", label: "Top Results", items: results.ordered },
    { id: "artists", label: "Artists", items: shelfResults.artists },
    { id: "albums", label: "Albums", items: shelfResults.albums },
    { id: "songs", label: "Songs", items: shelfResults.songs },
    { id: "playlists", label: "Playlists", items: shelfResults.playlists },
    {
      id: "music-videos",
      label: "Music Videos",
      items: shelfResults.musicVideos,
    },
  ];
  const tabs = allTabs.filter((tab) => tab.items.length > 0);
  const [activeTab, setActiveTab] = useState<MobileSearchTab>("top-results");
  const selectedTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className="search-tab-control">
      <div
        aria-label="Search result categories"
        className="search-tablist"
        role="tablist"
      >
        {tabs.map((tab) => (
          <label
            key={tab.id}
            role="tab"
            className="search-tab"
            id={`mobile-search-tab-${tab.id}-label`}
            aria-controls="mobile-search-panel"
            aria-selected={selectedTab?.id === tab.id}
          >
            <input
              className="search-tab__input"
              type="radio"
              name="mobile-search-results-category"
              id={`mobile-search-tab-${tab.id}`}
              value={tab.id}
              checked={selectedTab?.id === tab.id}
              onChange={() => setActiveTab(tab.id)}
            />
            {tab.label}
          </label>
        ))}
      </div>

      <div
        className="search-panel"
        id="mobile-search-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`mobile-search-tab-${selectedTab?.id ?? "empty"}-label`}
      >
        {selectedTab && (
          <MobileSearchMediaList items={selectedTab.items} />
        )}
      </div>
    </div>
  );
}
