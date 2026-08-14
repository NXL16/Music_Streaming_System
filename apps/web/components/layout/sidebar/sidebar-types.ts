import type { ReactNode } from "react";
import type { SongSummary } from "@/lib/songs/song.types";

export type SidebarNavigationItem = {
  key: string;
  label: string;
  subtitle?: string;
  href: string;
  icon: ReactNode;
  external?: boolean;
  variant?: "navigation";
  artworkUrl?: string;
  artworkSrcSet?: string;
  isExplicit?: boolean;
  playbackSong?: SongSummary;
  resourceType?: "songs" | "albums" | "playlists";
  resourceId?: string;
  isUserPlaylist?: boolean;
};

export type SidebarPinItem = {
  key: string;
  label: string;
  href?: never;
  icon: ReactNode;
  external?: never;
  variant: "pin";
  children?: SidebarNavigationItem[];
};

export type SidebarItem = SidebarNavigationItem | SidebarPinItem;
