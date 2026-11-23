import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  snapshot: vi.fn(),
  library: vi.fn(),
  album: vi.fn(),
  load: undefined as (() => Promise<unknown>) | undefined,
}));
vi.mock("@/lib/auth/auth-store", () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ user: { userId: "u1" } }),
    { getState: () => ({ user: { userId: "u1" } }) },
  ),
}));
vi.mock("@/lib/api/use-async-resource", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/api/use-async-resource")>();
  return {
    useAsyncResource: (
      ...args: Parameters<typeof original.useAsyncResource>
    ) => {
      api.load = args[0];
      return original.useAsyncResource(...args);
    },
  };
});
vi.mock("@/lib/library/library-resources.api", () => ({
  getFreshLibraryResourcesSnapshot: api.snapshot,
  getLibraryResources: api.library,
  getLibraryResourcesRevision: () => 0,
  isLibraryResourcePendingRemoval: () => false,
}));
vi.mock("@/lib/library/use-library-resources-revision", () => ({
  useLibraryResourcesRevision: () => 0,
}));
vi.mock("@/lib/catalog/catalog.api", () => ({ getCatalogAlbum: api.album }));
vi.mock("./catalog-detail-page", () => ({
  CatalogDetailPage: (props: unknown) => JSON.stringify(props),
}));
vi.mock("../loading/catalog-page-loading", () => ({
  default: () => "loading",
}));
vi.mock("../states/not-found-state", () => ({
  NotFoundState: () => "not-found",
}));

import { LibraryAlbumDetailPage } from "./library-album-detail-page";

const resources = [
  { resourceType: "albums", resourceId: "a1" },
  { resourceType: "songs", resourceId: "s1", sourceAlbumId: "a1" },
  { resourceType: "songs", resourceId: "s2", sourceAlbumId: "a2" },
];
const mount = () =>
  renderToString(
    createElement(LibraryAlbumDetailPage, {
      albumId: "a1",
      initialSelectedTrackId: "s1",
    }),
  ).replaceAll("&quot;", '"');

beforeEach(() => {
  vi.clearAllMocks();
  api.snapshot.mockReturnValue(undefined);
  api.album.mockResolvedValue({});
  api.library.mockResolvedValue(resources);
});

it("renders cached membership immediately with the selected track and only saved album songs", () => {
  api.snapshot.mockReturnValue(resources);
  expect(mount()).toContain('"librarySongIds":["s1"]');
  expect(mount()).toContain('"initialSelectedTrackId":"s1"');
  expect(api.library).not.toHaveBeenCalled();
});

it("rejects an album absent from the cached Library", () => {
  api.snapshot.mockReturnValue([]);
  expect(mount()).toBe("not-found");
});

it("starts catalog loading before the cold membership request completes", async () => {
  let finishLibrary!: (value: typeof resources) => void;
  api.library.mockReturnValue(
    new Promise((resolve) => {
      finishLibrary = resolve;
    }),
  );
  expect(mount()).toBe("loading");
  const request = api.load!();
  expect(api.library).toHaveBeenCalledTimes(1);
  expect(api.album).toHaveBeenCalledWith("a1");
  finishLibrary(resources);
  await expect(request).resolves.toEqual(resources);
});
