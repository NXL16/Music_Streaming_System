import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: 1,
  toggle: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/auth/auth-store", () => ({
  useAuthStore: { getState: () => ({ sessionVersion: mocks.session }) },
}));
vi.mock("./use-favorite-store", () => ({
  useFavoriteStore: { getState: () => ({ toggle: mocks.toggle }) },
}));
vi.mock("@/lib/notifications/menu-toast", () => ({
  notifyMenuSuccess: mocks.success,
  notifyMenuError: mocks.error,
}));
import { toggleSongFavorite } from "./toggle-song-favorite";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = 1;
});

it("deduplicates one release within a session without blocking the same release in a new session", async () => {
  const old = Promise.withResolvers<boolean>();
  mocks.toggle.mockReturnValueOnce(old.promise).mockResolvedValueOnce(true);
  const first = toggleSongFavorite("b", "single");
  expect(toggleSongFavorite("b", "single")).toBe(first);
  mocks.session = 2;
  await expect(toggleSongFavorite("b", "single")).resolves.toBe(true);
  old.resolve(false);
  await expect(first).resolves.toBeNull();
  expect(mocks.toggle).toHaveBeenCalledTimes(2);
  expect(mocks.success).toHaveBeenCalledTimes(1);
});
