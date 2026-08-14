export const PLAYLIST_ARTWORK_WIDTHS: readonly [40, 80, 296, 316, 592, 632];
export const PLAYLIST_HERO_ARTWORK_WIDTHS: readonly [450, 600, 900, 1200];
export function generatePlaylistCover(title: string, seed: string): Promise<Buffer>;
export function generatePlaylistCoverRenditions(title: string, seed: string): Promise<{
  cover: Map<number, Buffer>;
  hero: Map<number, Buffer>;
}>;
