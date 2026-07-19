"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  LayoutDashboard,
  Music2,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Image,
  X,
} from "lucide-react";
import {
  deleteAsset,
  deleteCatalogDraft,
  finalizeAssetUpload,
  generateAdminHomeRecommendations,
  getAdminHomeRecommendations,
  getAsset,
  getAssetUsages,
  getCatalogDraft,
  listAssets,
  listCatalogDrafts,
  publishAdminHomeRecommendations,
  publishCatalogDraft,
  replaceAdminHomeRecommendations,
  requestAssetUpload,
  saveCatalogDraft,
} from "@/lib/admin/admin.api";
import {
  getAdminUser,
  listAdminUsers,
  resetAdminUserTwoFactor,
  revokeAdminUserSessions,
  setAdminUserRole,
  setAdminUserStatus,
} from "@/lib/auth/auth.api";
import { useAuthStore } from "@/lib/auth/auth-store";
import type { UserProfile, UserRole } from "@/lib/auth/auth.types";
import { formatDateTime } from "@/lib/format/date";

const PAGE_SIZE = 20;
const ROLES: UserRole[] = [
  "USER",
  "ARTIST",
  "ADMIN_USER_OPS",
  "ADMIN_SECURITY_OPS",
  "SUPER_ADMIN",
];
const ADMIN_ROLES = new Set<UserRole>([
  "SUPER_ADMIN",
  "ADMIN_USER_OPS",
  "ADMIN_SECURITY_OPS",
]);

const ADMIN_SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "catalog", label: "Catalog", icon: Music2 },
  { id: "assets", label: "Assets", icon: Image },
  { id: "recommendations", label: "Recommendations", icon: Sparkles },
] as const;

type AdminSection = (typeof ADMIN_SECTIONS)[number]["id"];

type Feedback = {
  kind: "success" | "error";
  title: string;
  description: string;
};

type ConfirmationRequest = {
  userId: string;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  action: () => Promise<unknown>;
  destructive?: boolean;
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Không thể thực hiện thao tác.";
}

function roleLabel(role: string) {
  return role.replaceAll("_", " ");
}

export default function AdminDashboard() {
  const currentUser = useAuthStore((state) => state.user);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [status, setStatus] = useState<"all" | "active" | "disabled">("all");
  const [loading, setLoading] = useState(true);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(
    null,
  );
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");

  const isAdmin = ADMIN_ROLES.has(currentUser?.role as UserRole);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const result = await listAdminUsers({
        page,
        limit: PAGE_SIZE,
        search: submittedSearch || undefined,
        role: role || undefined,
        isActive: status === "all" ? undefined : status === "active",
      });
      setUsers(result.data.users);
      setTotal(result.data.total);
    } catch (loadError) {
      setFeedback({
        kind: "error",
        title: "Could not load identity records",
        description: errorMessage(loadError),
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page, role, status, submittedSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsers(), 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  const runAction = useCallback(
    async (
      userId: string,
      successMessage: string,
      action: () => Promise<unknown>,
    ) => {
      setActionUserId(userId);
      try {
        await action();
        setFeedback({
          kind: "success",
          title: "Identity updated",
          description: successMessage,
        });
        await loadUsers();
        return true;
      } catch (actionError) {
        setFeedback({
          kind: "error",
          title: "Action was not completed",
          description: errorMessage(actionError),
        });
        return false;
      } finally {
        setActionUserId(null);
      }
    },
    [loadUsers],
  );

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-(--bodyGutter) py-16">
        <div className="rounded-3xl border border-(--labelDivider) bg-(--systemQuinary) p-8 text-(--systemPrimary)">
          <ShieldCheck className="h-8 w-8" />
          <h1 className="mt-5 text-3xl font-black">Access restricted</h1>
          <p className="mt-3 leading-7">
            Identity administration requires an operations or security
            administrator role.
          </p>
        </div>
      </div>
    );
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSubmittedSearch(search.trim());
  };

  const confirmAction = async () => {
    if (!confirmation) return;
    const completed = await runAction(
      confirmation.userId,
      confirmation.successMessage,
      confirmation.action,
    );
    if (completed) setConfirmation(null);
  };

  const openUser = async (userId: string) => {
    setActionUserId(userId);
    try {
      const result = await getAdminUser(userId);
      setUsers((current) =>
        current.map((user) => (user.userId === userId ? result.data : user)),
      );
      setSelectedUserId(userId);
    } catch (detailError) {
      setFeedback({
        kind: "error",
        title: "Could not load user details",
        description: errorMessage(detailError),
      });
    } finally {
      setActionUserId(null);
    }
  };

  return (
    <div className="min-[484px]:-ms-(--web-navigation-width) min-[484px]:ps-(--web-navigation-width) pt-3">
      <div className="in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
        <div className="flex pt-3 in-[.is-drawer-open]:min-[1260px]:pe-75 motion-safe:min-[1260px]:[transition:padding-inline-end_.3s_cubic-bezier(.215,.61,.355,1)]">
          <div className="min-[1000px]:flex-1 min-[1000px]:-ms-5 min-[1000px]:min-w-0">
            <header className="items-center flex justify-end m-[0_var(--bodyGutter)_13px]">
              <div className="flex-1">
                <h1 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
                  Admin
                </h1>
              </div>
              <button
                type="button"
                onClick={() => void loadUsers()}
                className="inline-flex items-center gap-2 rounded-full border border-(--labelDivider) bg-(--button-circle-background-color) px-4 py-2.5 text-(--systemPrimary) [font:var(--callout-emphasized)] transition hover:bg-(--navSidebarSelectedState) disabled:opacity-50"
                disabled={loading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />{" "}
                Refresh
              </button>
            </header>

            <nav
              aria-label="Admin sections"
              className="m-[0_var(--bodyGutter)_22px] flex gap-2 overflow-x-auto border-b border-(--labelDivider) pb-3"
            >
              {ADMIN_SECTIONS.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 [font:var(--callout-emphasized)] transition ${active ? "bg-(--systemPrimary) text-(--background)" : "text-(--systemSecondary) hover:bg-(--navSidebarSelectedState) hover:text-(--systemPrimary)"}`}
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </nav>

            {activeSection === "overview" && (
              <section className="box-border p-[0_var(--shelfGridPaddingInline,var(--bodyGutter))] pb-8 relative w-full z-(--z-default)">
                <div className="items-center flex justify-end m-[0_0_13px]">
                  <div className="flex-1">
                    <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
                      Overview
                    </h2>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setActiveSection("users")}
                    className="group text-left border-t border-(--labelDivider) py-5 transition hover:opacity-70"
                  >
                    <span className="text-(--systemSecondary) [font:var(--callout)]">
                      Users
                    </span>
                    <strong className="mt-1 block text-(--systemPrimary) [font:var(--title-1-emphasized)]">
                      {total}
                    </strong>
                    <span className="mt-1 block text-(--systemSecondary) [font:var(--callout)]">
                      Manage access, roles, sessions and 2FA
                    </span>
                  </button>
                  <AdminCapability
                    title="Catalog"
                    description="Create, review and publish catalog drafts."
                    icon={Music2}
                  />
                  <AdminCapability
                    title="Assets"
                    description="Manage uploaded artwork and media files."
                    icon={Image}
                  />
                  <AdminCapability
                    title="Recommendations"
                    description="Generate, review and publish Home shelves."
                    icon={Sparkles}
                  />
                </div>
              </section>
            )}

            {activeSection === "users" && (
              <>
                <section className="pb-8 px-(--bodyGutter)">
                  <form
                    onSubmit={submitSearch}
                    className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px_auto]"
                  >
                    <label className="flex items-center gap-2 rounded-xl border border-(--labelDivider) bg-(--background) px-3">
                      <Search className="h-4 w-4 text-(--systemSecondary)" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search name, username, or email"
                        className="h-11 w-full bg-transparent text-(--systemPrimary) [font:var(--body)] outline-none placeholder:text-(--systemSecondary)"
                      />
                    </label>
                    <SelectBox
                      value={role}
                      placeholder="All roles"
                      options={[
                        { value: "", label: "All roles" },
                        ...ROLES.map((value) => ({
                          value,
                          label: roleLabel(value),
                        })),
                      ]}
                      onChange={(value) => {
                        setRole(value as UserRole | "");
                        setPage(1);
                      }}
                    />
                    <SelectBox
                      value={status}
                      options={[
                        { value: "all", label: "All statuses" },
                        { value: "active", label: "Active" },
                        { value: "disabled", label: "Disabled" },
                      ]}
                      onChange={(value) => {
                        setStatus(value as typeof status);
                        setPage(1);
                      }}
                    />
                    <button
                      className="h-11 rounded-full bg-(--keyColor) px-5 text-(--keyColorText) [font:var(--callout-emphasized)] transition hover:opacity-85"
                      type="submit"
                    >
                      Search
                    </button>
                  </form>
                </section>

                {feedback && (
                  <div
                    role="status"
                    className={`mt-5 flex items-start justify-between gap-4 rounded-xl px-4 py-3 ${feedback.kind === "error" ? "bg-(--statusNegativeBackground) text-(--keyColor)" : "bg-(--statusPositiveBackground) text-(--statusPositive)"}`}
                  >
                    <div>
                      <p className="[font:var(--callout-emphasized)]">
                        {feedback.title}
                      </p>
                      <p className="mt-1 [font:var(--callout)]">
                        {feedback.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFeedback(null)}
                      className="rounded-full p-1 transition hover:bg-black/10"
                      aria-label="Dismiss notification"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <div className="items-center flex justify-end m-[0_var(--bodyGutter)_13px]">
                  <div className="flex-1">
                    <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
                      <span>Directory</span>
                    </h2>
                  </div>
                </div>
              </>
            )}

            {activeSection !== "overview" && activeSection !== "users" && (
              <AdminModulePanel section={activeSection} />
            )}
            <div className="pb-8">
              <section className="box-border p-[0_var(--shelfGridPaddingInline,var(--bodyGutter))] relative w-full z-(--z-default)">
                <div className="grid grid-cols-[minmax(140px,1fr)_minmax(120px,1fr)_minmax(220px,1.4fr)_150px_130px] gap-4 border-b border-(--labelDivider) px-3 pb-2 text-(--systemSecondary) [font:var(--subhead)] max-lg:hidden">
                  <span>Display name</span>
                  <span>Username</span>
                  <span>Email</span>
                  <span>Role</span>
                  <span>Status</span>
                </div>
                <div className="box-content -me-0.5 -ms-0.5 overflow-visible pe-0.5 ps-0.5 w-full">
                  {loading ? (
                    <div className="py-12 text-center text-(--systemSecondary) [font:var(--body)]">
                      Loading identity records…
                    </div>
                  ) : users.length === 0 ? (
                    <div className="py-12 text-center text-(--systemSecondary) [font:var(--body)]">
                      No users match this filter.
                    </div>
                  ) : (
                    <ul className="box-border [list-style:none] m-0 overflow-hidden p-0">
                      {users.map((user) => {
                        return (
                          <li key={user.userId}>
                            <button
                              type="button"
                              onClick={() => void openUser(user.userId)}
                              className="group items-center text-(--systemPrimary) grid grid-cols-[minmax(140px,1fr)_minmax(120px,1fr)_minmax(220px,1.4fr)_150px_130px] gap-4 pb-[7.5px] pt-[7.5px] relative w-full pe-(--trackLockupPaddingInlineEnd,14px) cursor-pointer after:[border-top:var(--keyline-border-style)] after:content-[''] after:inset-e-0 after:inset-s-0 after:absolute after:top-0 after:z-(--z-default) text-left max-lg:block"
                            >
                              <span className="truncate text-(--systemPrimary) [font:var(--body-emphasized)]">
                                {user.displayName || user.username}
                              </span>
                              <span className="truncate text-(--systemSecondary) [font:var(--callout)] max-lg:mt-1">
                                @{user.username}
                              </span>
                              <span className="truncate text-(--systemSecondary) [font:var(--callout)] max-lg:mt-1">
                                {user.email}
                              </span>
                              <span className="text-(--systemPrimary) [font:var(--callout-emphasized)] max-lg:mt-2">
                                {roleLabel(user.role)}
                              </span>
                              <span className="max-lg:mt-2">
                                <Badge
                                  active={user.isActive}
                                  on="Active"
                                  off="Disabled"
                                />
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="flex items-center justify-between py-5">
                  <span className="text-(--systemSecondary) [font:var(--callout)]">
                    Page {page} of {pageCount}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((value) => value - 1)}
                      className="rounded-full border border-(--labelDivider) px-3 py-2 text-(--systemPrimary) [font:var(--subhead-emphasized)] disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={page >= pageCount || loading}
                      onClick={() => setPage((value) => value + 1)}
                      className="rounded-full border border-(--labelDivider) px-3 py-2 text-(--systemPrimary) [font:var(--subhead-emphasized)] disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </section>
            </div>
            {selectedUserId &&
              users.find((user) => user.userId === selectedUserId) && (
                <UserManagementDialog
                  user={users.find((user) => user.userId === selectedUserId)!}
                  currentUserId={currentUser?.userId}
                  busy={actionUserId === selectedUserId}
                  onClose={() => setSelectedUserId(null)}
                  onRequestConfirmation={setConfirmation}
                />
              )}
            {confirmation && (
              <ConfirmationDialog
                confirmation={confirmation}
                loading={actionUserId === confirmation.userId}
                onCancel={() => setConfirmation(null)}
                onConfirm={() => void confirmAction()}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({
  active,
  on,
  off,
}: {
  active: boolean;
  on: string;
  off: string;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 [font:var(--subhead-emphasized)] ${active ? "bg-(--statusPositiveBackground) text-(--statusPositive)" : "bg-(--navSidebarSelectedState) text-(--systemSecondary)"}`}
    >
      {active ? on : off}
    </span>
  );
}

function AdminCapability({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: typeof Music2;
}) {
  return (
    <div className="border-t border-(--labelDivider) py-5">
      <Icon className="mb-3 h-5 w-5 text-(--systemSecondary)" />
      <strong className="block text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
        {title}
      </strong>
      <span className="mt-1 block text-(--systemSecondary) [font:var(--callout)]">
        {description}
      </span>
    </div>
  );
}

function AdminModulePanel({
  section,
}: {
  section: Exclude<AdminSection, "overview" | "users">;
}) {
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (request: () => Promise<unknown>) => {
    setError(null);
    try {
      setResult(await request());
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const title =
    section === "catalog"
      ? "Catalog"
      : section === "assets"
        ? "Assets"
        : "Recommendations";

  return (
    <section className="box-border p-[0_var(--shelfGridPaddingInline,var(--bodyGutter))] pb-8 relative w-full z-(--z-default)">
      <div className="items-center flex justify-end m-[0_0_13px]">
        <div className="flex-1">
          <h2 className="text-(--header-title-color,var(--systemPrimary,#000)) inline-block [font:var(--header-title-font,var(--title-2-emphasized))]">
            {title}
          </h2>
        </div>
      </div>

      {section === "catalog" && <CatalogAdminActions onRun={run} />}
      {section === "assets" && <AssetAdminActions onRun={run} />}
      {section === "recommendations" && (
        <RecommendationAdminActions onRun={run} />
      )}

      {(result !== null || error) && (
        <div className="mt-6 border-t border-(--labelDivider) pt-5">
          <p
            className={`mb-3 [font:var(--callout-emphasized)] ${error ? "text-(--keyColor)" : "text-(--systemPrimary)"}`}
          >
            {error ? "Request failed" : "Response"}
          </p>
          <pre className="max-h-100 overflow-auto rounded-xl bg-(--systemQuinary) p-4 text-(--systemPrimary) [font:var(--footnote)]">
            {error ?? JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}

function CatalogAdminActions({
  onRun,
}: {
  onRun: (request: () => Promise<unknown>) => void;
}) {
  const [resourceType, setResourceType] = useState<
    "artists" | "songs" | "albums" | "playlists"
  >("artists");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AdminApiAction
        label="List drafts"
        defaultValue='{"limit":20}'
        onRun={(payload) => onRun(() => listCatalogDrafts(payload))}
      />
      <AdminApiAction
        label="Get, publish or delete draft"
        defaultValue='{"draftId":""}'
        onRun={(payload) =>
          onRun(() => {
            const draftId = requiredString(payload, "draftId");
            const action = String(payload.action ?? "get");
            return action === "publish"
              ? publishCatalogDraft(draftId)
              : action === "delete"
                ? deleteCatalogDraft(draftId)
                : getCatalogDraft(draftId);
          })
        }
        help="Add action: get, publish or delete."
      />
      <div className="border-t border-(--labelDivider) pt-5 lg:col-span-2">
        <SelectBox
          value={resourceType}
          onChange={(value) => setResourceType(value as typeof resourceType)}
          options={[
            { value: "artists", label: "Artist draft" },
            { value: "songs", label: "Song draft" },
            { value: "albums", label: "Album draft" },
            { value: "playlists", label: "Playlist draft" },
          ]}
        />
        <div className="mt-3">
          <AdminApiAction
            label={`Save ${resourceType.slice(0, -1)} draft`}
            defaultValue='{"resourceId":"","storefront":""}'
            onRun={(payload) =>
              onRun(() => saveCatalogDraft(resourceType, payload))
            }
            help="Supply the complete DTO for the selected resource type."
          />
        </div>
      </div>
    </div>
  );
}

function AssetAdminActions({
  onRun,
}: {
  onRun: (request: () => Promise<unknown>) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AdminApiAction
        label="List assets"
        defaultValue='{"limit":20}'
        onRun={(payload) => onRun(() => listAssets(payload))}
      />
      <AdminApiAction
        label="Request upload"
        defaultValue='{"kind":"IMAGE","purpose":"ARTWORK","fileName":"","contentType":"image/jpeg","sizeBytes":0}'
        onRun={(payload) => onRun(() => requestAssetUpload(payload))}
        help="Use the returned uploadUrl to upload the file, then finalize with its assetId."
      />
      <AdminApiAction
        label="Get asset or usages"
        defaultValue='{"assetId":"","action":"get"}'
        onRun={(payload) =>
          onRun(() =>
            String(payload.action ?? "get") === "usages"
              ? getAssetUsages(requiredString(payload, "assetId"))
              : getAsset(requiredString(payload, "assetId")),
          )
        }
        help="Set action to get or usages."
      />
      <AdminApiAction
        label="Finalize or delete asset"
        defaultValue='{"assetId":"","action":"finalize"}'
        onRun={(payload) =>
          onRun(() =>
            String(payload.action ?? "finalize") === "delete"
              ? deleteAsset(requiredString(payload, "assetId"))
              : finalizeAssetUpload(requiredString(payload, "assetId")),
          )
        }
        help="Set action to finalize or delete."
      />
    </div>
  );
}

function RecommendationAdminActions({
  onRun,
}: {
  onRun: (request: () => Promise<unknown>) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AdminApiAction
        label="Load Home page"
        defaultValue='{"scope":"GLOBAL","name":"listen-now","locale":"en-GB","timezone":"+07:00","platform":"web"}'
        onRun={(payload) => onRun(() => getAdminHomeRecommendations(payload))}
      />
      <AdminApiAction
        label="Generate Home recommendations"
        defaultValue='{"scope":"GLOBAL","name":"listen-now","locale":"en-GB","timezone":"+07:00","platform":"web"}'
        onRun={(payload) =>
          onRun(() => generateAdminHomeRecommendations(payload))
        }
      />
      <AdminApiAction
        label="Replace Home recommendations"
        defaultValue='{"scope":"GLOBAL","name":"listen-now","locale":"en-GB","timezone":"+07:00","platform":"web","sections":[]}'
        onRun={(payload) =>
          onRun(() => replaceAdminHomeRecommendations(payload))
        }
        help="Replacement saves a draft; provide the complete sections payload."
      />
      <AdminApiAction
        label="Publish Home recommendations"
        defaultValue='{"scope":"GLOBAL","name":"listen-now"}'
        onRun={(payload) =>
          onRun(() => publishAdminHomeRecommendations(payload))
        }
      />
    </div>
  );
}

function AdminApiAction({
  label,
  defaultValue,
  help,
  onRun,
}: {
  label: string;
  defaultValue: string;
  help?: string;
  onRun: (payload: Record<string, unknown>) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [inputError, setInputError] = useState<string | null>(null);
  return (
    <div className="border-t border-(--labelDivider) pt-5">
      <p className="text-(--systemPrimary) [font:var(--body-tall-emphasized)]">
        {label}
      </p>
      {help && (
        <p className="mt-1 text-(--systemSecondary) [font:var(--callout)]">
          {help}
        </p>
      )}
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="mt-3 min-h-28 w-full rounded-xl border border-(--labelDivider) bg-(--background) p-3 text-(--systemPrimary) [font:var(--footnote)] outline-none"
        spellCheck={false}
      />
      {inputError && (
        <p className="mt-2 text-(--keyColor) [font:var(--footnote)]">
          {inputError}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          try {
            const payload = JSON.parse(value) as Record<string, unknown>;
            setInputError(null);
            onRun(payload);
          } catch {
            setInputError("Payload must be valid JSON.");
          }
        }}
        className="mt-3 rounded-full border border-(--labelDivider) px-4 py-2 text-(--systemPrimary) [font:var(--callout-emphasized)] transition hover:bg-(--navSidebarSelectedState)"
      >
        Run
      </button>
    </div>
  );
}

function requiredString(payload: Record<string, unknown>, key: string) {
  const value = String(payload[key] ?? "").trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function SelectBox({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const label =
    options.find((option) => option.value === value)?.label ??
    placeholder ??
    "Select";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-(--labelDivider) bg-(--background) px-3 text-(--systemPrimary) [font:var(--callout-emphasized)]"
      >
        <span className="truncate">{label}</span>
        <span className="ms-3 text-(--systemSecondary)">⌄</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-(--labelDivider) bg-(--background) py-1 shadow-[0_12px_28px_var(--glassMaterialShadowColor)]">
          {options.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left [font:var(--callout)] hover:bg-(--navSidebarSelectedState) ${option.value === value ? "text-(--keyColor)" : "text-(--systemPrimary)"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserManagementDialog({
  user,
  currentUserId,
  busy,
  onClose,
  onRequestConfirmation,
}: {
  user: UserProfile;
  currentUserId?: string;
  busy: boolean;
  onClose: () => void;
  onRequestConfirmation: (request: ConfirmationRequest) => void;
}) {
  const isCurrentUser = user.userId === currentUserId;
  const initials = (user.displayName || user.username)
    .slice(0, 2)
    .toUpperCase();
  const requestRoleChange = (nextRole: string) => {
    if (nextRole === user.role) return;
    onRequestConfirmation({
      userId: user.userId,
      title: "Change account role",
      description: `Change ${user.username} from ${roleLabel(user.role)} to ${roleLabel(nextRole)}. This changes what the account is allowed to access.`,
      confirmLabel: "Change role",
      successMessage: `${user.username} now has the ${roleLabel(nextRole)} role.`,
      action: () => setAdminUserRole(user.userId, nextRole as UserRole),
    });
  };
  return (
    <div className="fixed inset-0 z-[calc(var(--z-web-chrome)+5)] flex items-center justify-center bg-black/45 p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-management-title"
        className="w-full max-w-2xl overflow-hidden rounded-3xl border border-(--labelDivider) bg-(--background) text-(--systemPrimary) shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-(--labelDivider) px-6 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--systemPrimary) text-(--background) [font:var(--callout-emphasized)]">
              {initials}
            </div>
            <div className="min-w-0">
              <h2
                id="user-management-title"
                className="truncate [font:var(--title-2-emphasized)]"
              >
                {user.displayName || user.username}
              </h2>
              <p className="truncate text-(--systemSecondary) [font:var(--callout)]">
                @{user.username} · {user.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-(--systemSecondary) transition hover:bg-(--navSidebarSelectedState)"
            aria-label="Close user management"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="grid gap-6 p-6 md:grid-cols-2">
          <section>
            <p className="text-(--systemSecondary) [font:var(--subhead-emphasized)] uppercase tracking-[0.12em]">
              Access
            </p>
            <div className="mt-3">
              <SelectBox
                value={user.role}
                options={ROLES.map((role) => ({
                  value: role,
                  label: roleLabel(role),
                }))}
                onChange={requestRoleChange}
              />
            </div>
            <button
              type="button"
              disabled={busy || isCurrentUser}
              onClick={() =>
                onRequestConfirmation({
                  userId: user.userId,
                  title: user.isActive ? "Disable account" : "Enable account",
                  description: user.isActive
                    ? `${user.username} will not be able to sign in until the account is enabled again.`
                    : `${user.username} will be able to sign in again.`,
                  confirmLabel: user.isActive
                    ? "Disable account"
                    : "Enable account",
                  successMessage: user.isActive
                    ? `${user.username}'s account has been disabled.`
                    : `${user.username}'s account has been enabled.`,
                  action: () => setAdminUserStatus(user.userId, !user.isActive),
                  destructive: user.isActive,
                })
              }
              className={`mt-3 h-10 rounded-full px-4 [font:var(--callout-emphasized)] disabled:opacity-50 ${user.isActive ? "bg-(--statusNegativeBackground) text-(--keyColor)" : "bg-(--systemPrimary) text-(--background)"}`}
            >
              {user.isActive ? "Disable account" : "Enable account"}
            </button>
            <p className="mt-4 text-(--systemSecondary) [font:var(--callout)]">
              Created {formatDateTime(user.createdAt)}
              <br />
              Last sign-in {formatDateTime(user.lastLoginAt)}
            </p>
          </section>
          <section>
            <p className="text-(--systemSecondary) [font:var(--subhead-emphasized)] uppercase tracking-[0.12em]">
              Security
            </p>
            <div className="mt-3 flex flex-col items-start gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onRequestConfirmation({
                    userId: user.userId,
                    title: "Revoke all sessions",
                    description: `Every active session for ${user.username} will be signed out immediately. The user must sign in again on each device.`,
                    confirmLabel: "Revoke sessions",
                    successMessage: `All sessions for ${user.username} have been revoked.`,
                    action: () => revokeAdminUserSessions(user.userId),
                    destructive: true,
                  })
                }
                className="inline-flex h-10 items-center gap-2 rounded-full border border-(--labelDivider) px-4 [font:var(--callout-emphasized)] transition hover:bg-(--navSidebarSelectedState) disabled:opacity-50"
              >
                <Power className="h-4 w-4" />
                Revoke sessions
              </button>
              <button
                type="button"
                disabled={busy || !user.twoFactorEnabled}
                onClick={() =>
                  onRequestConfirmation({
                    userId: user.userId,
                    title: "Reset two-factor authentication",
                    description: `${user.username}'s current authenticator setup and recovery codes will be removed. They must set up 2FA again.`,
                    confirmLabel: "Reset 2FA",
                    successMessage: `Two-factor authentication for ${user.username} has been reset.`,
                    action: () => resetAdminUserTwoFactor(user.userId),
                    destructive: true,
                  })
                }
                className="inline-flex h-10 items-center gap-2 rounded-full border border-(--labelDivider) px-4 [font:var(--callout-emphasized)] transition hover:bg-(--navSidebarSelectedState) disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                Reset 2FA
              </button>
            </div>
            <p className="mt-4 text-(--systemSecondary) [font:var(--callout)]">
              {user.twoFactorEnabled
                ? "Two-factor authentication is enabled."
                : "Two-factor authentication is not enabled."}
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}

function ConfirmationDialog({
  confirmation,
  loading,
  onCancel,
  onConfirm,
}: {
  confirmation: ConfirmationRequest;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[calc(var(--z-web-chrome)+10)] flex items-center justify-center bg-black/45 p-5"
      role="presentation"
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="identity-confirmation-title"
        className="w-full max-w-md rounded-3xl border border-(--labelDivider) bg-(--background) p-6 text-(--systemPrimary) shadow-2xl"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-(--statusNegativeBackground) text-(--keyColor)">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h2
          id="identity-confirmation-title"
          className="mt-5 [font:var(--title-2-emphasized)]"
        >
          {confirmation.title}
        </h2>
        <p className="mt-3 text-(--systemSecondary) [font:var(--body-tall)]">
          {confirmation.description}
        </p>
        <div className="mt-7 flex justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="rounded-full border border-(--labelDivider) px-4 py-2.5 text-(--systemPrimary) [font:var(--callout-emphasized)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`rounded-full px-4 py-2.5 [font:var(--callout-emphasized)] disabled:opacity-50 ${confirmation.destructive ? "bg-(--keyColor) text-(--keyColorText)" : "bg-(--systemPrimary) text-(--background)"}`}
          >
            {loading ? "Working…" : confirmation.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
