"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MediaCardRenderer from "@/components/media/media-card-renderer";
import type {
  MediaCardArtist,
  MediaCardProps,
} from "@/components/media/media-card.types";
import { MusicPageLayout } from "@/components/layout/music-page-layout";
import { http } from "@/lib/api/http";
import { useAuthStore } from "@/lib/auth/auth-store";
import { getCatalogResources } from "@/lib/catalog/catalog.api";
import type { CatalogResponse } from "@/lib/catalog/catalog.types";
import { artistRoute } from "@/lib/catalog/artist-route";
import { albumRoute } from "@/lib/catalog/album-route";

type Playlist = {
  id: string;
  name: string;
  description?: string;
  trackCount?: number;
  createdAt?: string;
};

type LibraryResource = {
  resourceType: "albums" | "playlists";
  resourceId: string;
  title: string;
  subtitle: string;
  artworkUrl: string;
  createdAt?: string;
};

const PERSONAL_PLAYLIST_ARTWORK = {
  bg: "#4a4566",
  main: "#4a4566",
};
const SAVED_RESOURCE_ARTWORK = {
  bg: "#34343b",
  main: "#34343b",
};

function personalPlaylistCard(playlist: Playlist): MediaCardProps {
  return {
    id: `personal-playlist-${playlist.id}`,
    resourceId: playlist.id,
    resourceType: "user-playlist",
    cardType: "collection",
    title: playlist.name,
    subtitle: playlist.description || `${playlist.trackCount ?? 0} songs`,
    imageUrl: "",
    imageSrcSet: "",
    artworkColors: PERSONAL_PLAYLIST_ARTWORK,
    typeTag: "Playlist",
    slug: `/playlist/${playlist.id}?library=1`,
  };
}

function resourceKey(resource: Pick<LibraryResource, "resourceType" | "resourceId">) {
  return `${resource.resourceType}-${resource.resourceId}`;
}

function catalogArtistsForResource(
  catalog: CatalogResponse | null,
  resource: LibraryResource,
): MediaCardArtist[] {
  if (!catalog || resource.resourceType !== "albums") return [];

  const catalogResource = catalog.resources.albums[resource.resourceId];

  return (catalogResource?.relationships.artists?.data ?? []).flatMap(
    (reference) => {
      const artist = catalog.resources.artists[reference.id];
      if (!artist?.attributes.url) return [];

      return [
        {
          id: artist.id,
          name: artist.attributes.name,
          url: artistRoute(artist.attributes.url, artist.id),
        },
      ];
    },
  );
}

function catalogRouteForResource(
  catalog: CatalogResponse | null,
  resource: LibraryResource,
): string | undefined {
  if (!catalog) return undefined;

  if (resource.resourceType === "albums") {
    const album = catalog.resources.albums[resource.resourceId];
    return album?.attributes.url
      ? albumRoute(album.attributes.url, album.id)
      : undefined;
  }

  return catalog.resources.playlists[resource.resourceId]
    ? `/playlist/${encodeURIComponent(resource.resourceId)}`
    : undefined;
}

function savedResourceCard(
  resource: LibraryResource,
  artists: MediaCardArtist[],
  slug?: string,
): MediaCardProps {
  return {
    id: `library-${resource.resourceType}-${resource.resourceId}`,
    resourceId: resource.resourceId,
    resourceType: resource.resourceType,
    cardType: "collection",
    title: resource.title,
    subtitle:
      resource.subtitle ||
      (resource.resourceType === "albums" ? "Album" : "Playlist"),
    imageUrl: resource.artworkUrl,
    imageSrcSet: resource.artworkUrl,
    artworkColors: SAVED_RESOURCE_ARTWORK,
    typeTag: resource.resourceType === "albums" ? "Album" : "Playlist",
    artists,
    slug,
  };
}

export default function AllPlaylistsPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [resources, setResources] = useState<LibraryResource[]>([]);
  const [savedArtists, setSavedArtists] = useState<
    Record<string, MediaCardArtist[]>
  >({});
  const [savedRoutes, setSavedRoutes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.userId) return;
    let active = true;

    void (async () => {
      try {
        const [playlistResponse, resourceResponse] = await Promise.all([
          http.get(`/playlists/user/${encodeURIComponent(user.userId)}`, {
            params: { limit: 50 },
          }),
          http.get<{ resources: LibraryResource[] }>(
            "/songs/library/resources",
          ),
        ]);
        if (!active) return;
        const savedResources = resourceResponse.data.resources ?? [];
        setPlaylists(
          playlistResponse.data.playlists ??
            playlistResponse.data.data?.playlists ??
            [],
        );
        setResources(savedResources);
        setError("");

        const catalog = savedResources.length
          ? await getCatalogResources(
              savedResources.map((resource) => ({
                type: resource.resourceType,
                id: resource.resourceId,
              })),
            ).catch(() => null)
          : null;
        if (!active) return;
        setSavedArtists(
          Object.fromEntries(
            savedResources.map((resource) => [
              resourceKey(resource),
              catalogArtistsForResource(catalog, resource),
            ]),
          ),
        );
        setSavedRoutes(
          Object.fromEntries(
            savedResources.flatMap((resource) => {
              const route = catalogRouteForResource(catalog, resource);
              return route ? [[resourceKey(resource), route]] : [];
            }),
          ),
        );
      } catch {
        if (active) setError("Could not load your library.");
      }
    })();

    return () => {
      active = false;
    };
  }, [user?.userId]);

  const libraryCards = useMemo(
    () =>
      [
        ...playlists.map((playlist) => ({
          card: personalPlaylistCard(playlist),
          createdAt: playlist.createdAt,
        })),
        ...resources.map((resource) => ({
          card: savedResourceCard(
            resource,
            savedArtists[resourceKey(resource)] ?? [],
            savedRoutes[resourceKey(resource)],
          ),
          createdAt: resource.createdAt,
        })),
      ].sort(
        (left, right) =>
          new Date(right.createdAt ?? 0).getTime() -
          new Date(left.createdAt ?? 0).getTime(),
      ),
    [playlists, resources, savedArtists, savedRoutes],
  );

  return (
    <MusicPageLayout>
      <header className="items-center flex mx-(--bodyGutter) mb-3.25">
        <button
          aria-label="Back"
          className="-ms-1 me-1 p-1 text-(--systemSecondary)"
          onClick={() => router.back()}
          type="button"
        >
          <svg aria-hidden="true" className="h-4 w-4 fill-current" viewBox="0 0 16 16">
            <path d="M10.68 1.6a.75.75 0 0 1 0 1.06L5.34 8l5.34 5.34a.75.75 0 1 1-1.06 1.06L3.75 8.53a.75.75 0 0 1 0-1.06L9.62 1.6a.75.75 0 0 1 1.06 0Z" />
          </svg>
        </button>
        <h1 className="text-(--header-title-color,var(--systemPrimary,#000)) [font:var(--header-title-font,var(--title-2-emphasized))]">
          All Playlists
        </h1>
      </header>
      {error && (
        <p className="mx-(--bodyGutter) text-(--keyColor) [font:var(--callout)]">
          {error}
        </p>
      )}
      {!!libraryCards.length && (
        <ul className="grid list-none grid-cols-2 gap-x-5 gap-y-6 m-0 px-(--bodyGutter) pb-10 pt-0 min-[640px]:grid-cols-3 min-[1000px]:grid-cols-4 min-[1260px]:grid-cols-5 min-[1580px]:grid-cols-6 min-[1940px]:grid-cols-7">
          {libraryCards.map(({ card }) => (
            <MediaCardRenderer key={card.id} {...card} />
          ))}
        </ul>
      )}
      {!error && !libraryCards.length && (
        <p className="mx-(--bodyGutter) py-6 text-(--systemSecondary) [font:var(--callout)]">
          Albums and playlists you add to your library will appear here.
        </p>
      )}
    </MusicPageLayout>
  );
}
