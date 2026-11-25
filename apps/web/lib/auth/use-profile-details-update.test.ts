import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { updateProfile } from "./auth.api";
import { useProfileDetailsUpdate } from "./use-profile-details-update";

const { setUser } = vi.hoisted(() => ({ setUser: vi.fn() }));
vi.mock("./auth.api", () => ({ updateProfile: vi.fn() }));
vi.mock("./auth-store", () => ({
  useAuthStore: (selector: (state: { setUser: typeof setUser }) => unknown) =>
    selector({ setUser }),
}));

beforeEach(() => vi.clearAllMocks());

function getHandlers() {
  let handlers!: ReturnType<typeof useProfileDetailsUpdate>;
  function Probe() {
    handlers = useProfileDetailsUpdate();
    return null;
  }
  renderToString(createElement(Probe));
  return handlers;
}

it("preserves an empty bio in the request and applies the server response", async () => {
  const user = { displayName: "Listener", bio: "" };
  vi.mocked(updateProfile).mockResolvedValue({ data: user } as Awaited<
    ReturnType<typeof updateProfile>
  >);
  expect(
    await getHandlers().saveProfileDetails({
      displayName: " Listener ",
      bio: " ",
    }),
  ).toBe(true);
  expect(updateProfile).toHaveBeenCalledWith({
    displayName: "Listener",
    bio: "",
  });
  expect(setUser).toHaveBeenCalledWith(user);
});

it("rejects invalid names without sending a request", async () => {
  const { saveProfileDetails } = getHandlers();
  expect(await saveProfileDetails({ displayName: " " })).toBe(false);
  expect(await saveProfileDetails({ displayName: "a".repeat(51) })).toBe(false);
  expect(updateProfile).not.toHaveBeenCalled();
});

it("prevents duplicate requests and allows retry after failure", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(updateProfile).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const { saveProfileDetails } = getHandlers();
  const first = saveProfileDetails({ displayName: "Listener" });
  expect(await saveProfileDetails({ displayName: "Listener" })).toBe(false);
  expect(updateProfile).toHaveBeenCalledOnce();
  reject(new Error("Unavailable"));
  expect(await first).toBe(false);
  expect(setUser).not.toHaveBeenCalled();
  vi.mocked(updateProfile).mockResolvedValue({
    data: { displayName: "Listener" },
  } as Awaited<ReturnType<typeof updateProfile>>);
  expect(await saveProfileDetails({ displayName: "Listener" })).toBe(true);
});
