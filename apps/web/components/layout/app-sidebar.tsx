"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth-store";
import { http } from "@/lib/api/http";
import { useWalletBalance } from "@/lib/wallet/use-wallet-balance";
import { Coins, Plus, Settings } from "lucide-react";
import Image from "next/image";
import { useIsMobile } from "./sidebar/use-is-mobile";
import { useUserPlaylists } from "./sidebar/use-user-playlists";
import { usePinnedLibraryResources } from "./sidebar/use-pinned-library-resources";
import { ensureFavoriteLibraryResource } from "@/lib/favorites/ensure-favorite-library-resource";
import { PlaylistIcon } from "./sidebar/playlist-icon";
import { albumRoute } from "@/lib/catalog/album-route";
import { songRoute } from "@/lib/catalog/song-route";
import {
  identityAdminItems,
  libraryItems,
  playlistItems,
  primaryNavigationItems,
  roomNavigationItems,
} from "./sidebar/sidebar-data";
import { SidebarSection } from "./sidebar/sidebar-section";
import type { SidebarItem } from "./sidebar/sidebar-types";

function AppleMusicLogo() {
  return (
    <svg
      height="20"
      viewBox="0 0 83 20"
      width="83"
      xmlns="http://www.w3.org/2000/svg"
      className="inline-block align-baseline h-3.75 fill-(--systemPrimary) w-auto min-[484px]:h-5 min-[484px]:w-20.75 max-[483px]:transform-[translateY(1px)]"
      aria-hidden="true"
    >
      <path d="M34.752 19.746V6.243h-.088l-5.433 13.503h-2.074L21.711 6.243h-.087v13.503h-2.548V1.399h3.235l5.833 14.621h.1l5.82-14.62h3.248v18.347h-2.56zm16.649 0h-2.586v-2.263h-.062c-.725 1.602-2.061 2.504-4.072 2.504-2.86 0-4.61-1.894-4.61-4.958V6.37h2.698v8.125c0 2.034.95 3.127 2.81 3.127 1.95 0 3.124-1.373 3.124-3.458V6.37H51.4v13.376zm7.394-13.618c3.06 0 5.046 1.73 5.134 4.196h-2.536c-.15-1.296-1.087-2.11-2.598-2.11-1.462 0-2.436.724-2.436 1.793 0 .839.6 1.41 2.023 1.741l2.136.496c2.686.636 3.71 1.704 3.71 3.636 0 2.442-2.236 4.12-5.333 4.12-3.285 0-5.26-1.64-5.509-4.183h2.673c.25 1.398 1.187 2.085 2.836 2.085 1.623 0 2.623-.687 2.623-1.78 0-.865-.487-1.373-1.924-1.704l-2.136-.508c-2.498-.585-3.735-1.806-3.735-3.75 0-2.391 2.049-4.032 5.072-4.032zM66.1 2.836c0-.878.7-1.577 1.561-1.577.862 0 1.55.7 1.55 1.577 0 .864-.688 1.576-1.55 1.576a1.573 1.573 0 0 1-1.56-1.576zm.212 3.534h2.698v13.376h-2.698zm14.089 4.603c-.275-1.424-1.324-2.556-3.085-2.556-2.086 0-3.46 1.767-3.46 4.64 0 2.938 1.386 4.642 3.485 4.642 1.66 0 2.748-.928 3.06-2.48H83C82.713 18.067 80.477 20 77.317 20c-3.76 0-6.208-2.62-6.208-6.942 0-4.247 2.448-6.93 6.183-6.93 3.385 0 5.446 2.213 5.683 4.845h-2.573zM10.824 3.189c-.698.834-1.805 1.496-2.913 1.398-.145-1.128.41-2.33 1.036-3.065C9.644.662 10.848.05 11.835 0c.121 1.178-.336 2.33-1.01 3.19zm.999 1.619c.624.049 2.425.244 3.578 1.98-.096.074-2.137 1.272-2.113 3.79.024 3.01 2.593 4.012 2.617 4.037-.024.074-.407 1.419-1.344 2.812-.817 1.224-1.657 2.422-3.002 2.447-1.297.024-1.73-.783-3.218-.783-1.489 0-1.97.758-3.194.807-1.297.048-2.28-1.297-3.097-2.52C.368 14.908-.904 10.408.825 7.375c.84-1.516 2.377-2.47 4.034-2.495 1.273-.023 2.45.857 3.218.857.769 0 2.137-1.027 3.746-.93z"></path>
    </svg>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const userPlaylists = useUserPlaylists(user?.userId);
  const pinnedResources = usePinnedLibraryResources(user?.userId);

  useEffect(() => {
    if (user?.userId) {
      // This is a background bootstrap; page-level callers handle visible
      // errors themselves, so do not leave a global unhandled rejection here.
      void ensureFavoriteLibraryResource().catch(() => undefined);
    }
  }, [user?.userId]);
  const canManageIdentity = [
    "SUPER_ADMIN",
    "ADMIN_USER_OPS",
    "ADMIN_SECURITY_OPS",
  ].includes(user?.role ?? "");
  const { balance } = useWalletBalance();

  const visiblePlaylistItems: SidebarItem[] = [
    ...playlistItems.slice(0, 2),
    ...(user?.userId ? userPlaylists : []).map((playlist) => ({
      key: `user-playlist-${playlist.id}`,
      label: playlist.name,
      href: `/library/playlist/${playlist.id}`,
      icon: <PlaylistIcon />,
    })),
  ];

  const visibleLibraryItems: SidebarItem[] = libraryItems
    .map((item): SidebarItem | null => {
      if (item.variant !== "pin") return item;
      if (!pinnedResources.length) return null;

      return {
        ...item,
        children: pinnedResources.map((resource) => ({
          key: `pinned-${resource.resourceType}-${resource.resourceId}`,
          label: resource.title || resource.resourceId,
          subtitle: resource.subtitle,
          href:
            resource.resourceType === "songs"
              ? songRoute(resource.resourceId)
              : resource.resourceType === "albums"
                ? resource.catalogUrl
                  ? albumRoute(resource.catalogUrl, resource.resourceId)
                  : albumRoute("album", resource.resourceId)
                : resource.catalogUrl ||
                  `/library/playlist/${encodeURIComponent(resource.resourceId)}`,
          icon: <PlaylistIcon />,
          artworkUrl: resource.artworkUrl,
          artworkSrcSet: resource.artworkSrcSet,
          isExplicit: resource.contentRating === "explicit",
          playbackSong: resource.playbackSong,
          resourceType: resource.resourceType,
          resourceId: resource.resourceId,
          isUserPlaylist:
            resource.resourceType === "playlists" &&
            (resource.resourceId === "favorite" ||
              resource.catalogUrl?.startsWith("/library/playlist/")),
        })),
      };
    })
    .filter((item): item is SidebarItem => item !== null);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const isMobile = useIsMobile();

  const toggleNavigation = () => {
    if (isAnimating) {
      return;
    }

    setIsAnimating(true);
    setIsExpanded((expanded) => !expanded);
  };

  const closeNavigation = () => {
    if (!isExpanded) return;

    // Navigation should be immediate on mobile. The hamburger icon still
    // animates from the `is-expanded` state, while the drawer closes at once.
    setIsAnimating(false);
    setIsExpanded(false);
  };

  const openRoom = async () => {
    closeNavigation();

    try {
      const response = await http.post("/sso/room/start");
      const redirectUrl = response.data?.data?.redirectUrl;
      if (typeof redirectUrl !== "string") {
        throw new Error("ROOM_SSO_REDIRECT_URL_MISSING");
      }
      window.location.assign(redirectUrl);
    } catch {
      window.alert("Không thể mở Room. Vui lòng thử lại sau.");
    }
  };

  return (
    <div className="gap-0 [grid-area:structure-header] size-full relative z-(--z-web-chrome) min-[484px]:z-[calc(var(--z-web-chrome)-11)] min-[484px]:w-[33.8842975207vw] min-[767.32px]:w-65">
      <nav
        onTransitionEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.propertyName === "height"
          ) {
            setIsAnimating(false);
          }
        }}
        className={`${isExpanded ? "is-expanded" : ""} flex flex-col w-full transform-gpu backface-hidden z-(--z-web-chrome) min-[484px]:[border-inline-end:1px_solid_var(--labelDivider)] min-[484px]:relative dark:[--navigation-shadow-color:rgba(0,0,0,.2)] in-[.app-container]:[--navigation-border-color:var(--glassMaterialInnerStrokeCombined)] in-[.app-container]:[--navigation-shadow-color:rgba(0,0,0,0.1)] in-[.app-container]:[backdrop-filter:saturate(220%)_blur(16px)] in-[.app-container]:bg-(--glassMaterialBackground) in-[.app-container]:[box-shadow:0_10px_40px_var(--glassMaterialShadowColor)] min-[484px]:in-[.app-container]:[border:.5px_solid_var(--navigation-border-color)] min-[484px]:in-[.app-container]:rounded-[20px] min-[484px]:in-[.app-container]:[box-shadow:0_10px_40px_var(--navigation-shadow-color)] min-[484px]:in-[.app-container]:h-[calc(100%-16px)] min-[484px]:in-[.app-container]:mbs-2 min-[484px]:in-[.app-container]:ms-2 min-[484px]:in-[.app-container]:w-[calc(100%-16px)] max-[483px]:h-13 max-[483px]:overflow-hidden max-[483px]:fixed max-[483px]:inset-x-0 max-[483px]:top-0 max-[483px]:in-[.app-container]:shadow-none max-[483px]:[.is-expanded]:h-dvh ${isAnimating ? "will-change-[height] [transition:height_.56s_cubic-bezier(.52,.16,.24,1)]" : ""} max-[483px]:in-[.app-container]:[border-bottom:0.5px_solid_var(--navigation-border-color)] dark:[--navigation-border-color:var(--glassMaterialInnerStrokeCombined-onDark)] dark:[--glassMaterialBackground:var(--glassMaterialBackground-onDark)]`}
      >
        <div className="grid max-[483px]:items-center max-[483px]:grid-cols-[repeat(3,1fr)] max-[483px]:h-13 max-[483px]:me-4 max-[483px]:ms-3.5 max-[483px]:py-1">
          <button
            type="button"
            onClick={toggleNavigation}
            disabled={isAnimating}
            aria-label={
              isExpanded ? "Close navigation menu" : "Open navigation menu"
            }
            aria-expanded={isExpanded}
            aria-controls="navigation"
            className="h-11 relative w-11 z-(--z-default) max-[483px]:[justify-self:start] min-[484px]:hidden"
          >
            <span className="h-5 left-3.25 pointer-events-none absolute top-3 [transition:transform_.1806s_cubic-bezier(.04,.04,.12,.96)] w-5 z-(--z-default) in-[.app-container]:left-2.5 in-[.app-container]:w-6 in-[.is-expanded]:h-6 in-[.is-expanded]:left-2.5 in-[.is-expanded]:[transition:transform_.3192s_cubic-bezier(.04,.04,.12,.96)_.1008s] in-[.is-expanded]:w-6 in-[.is-expanded]:transform-[rotate(-45deg)]">
              <span className="bg-(--keyColor) rounded-[1px] block h-0.5 absolute [transition:transform_.1596s_cubic-bezier(.52,.16,.52,.84)_.1008s] w-5 z-(--z-default) top-2.25 transform-[translateY(-4px)] pointer-events-none in-[.app-container]:bg-(--systemPrimary) in-[.app-container]:w-6 in-[.is-expanded]:transform-[translateY(0)] in-[.is-expanded]:[transition:transform_.1806s_cubic-bezier(.04,.04,.12,.96)] in-[.is-expanded]:w-6 in-[.is-expanded]:top-2.75"></span>
            </span>

            <span className="h-5 left-3.25 pointer-events-none absolute top-3 [transition:transform_.1806s_cubic-bezier(.04,.04,.12,.96)] w-5 z-(--z-default) in-[.app-container]:left-2.5 in-[.app-container]:w-6 in-[.is-expanded]:h-6 in-[.is-expanded]:left-2.5 in-[.is-expanded]:[transition:transform_.3192s_cubic-bezier(.04,.04,.12,.96)_.1008s] in-[.is-expanded]:w-6 in-[.is-expanded]:transform-[rotate(45deg)]">
              <span className="bg-(--keyColor) rounded-[1px] block h-0.5 absolute [transition:transform_.1596s_cubic-bezier(.52,.16,.52,.84)_.1008s] w-5 z-(--z-default) bottom-2.25 transform-[translateY(4px)] pointer-events-none in-[.app-container]:bg-(--systemPrimary) in-[.app-container]:w-6 in-[.is-expanded]:transform-[translateY(0)] in-[.is-expanded]:[transition:transform_.1806s_cubic-bezier(.04,.04,.12,.96)] in-[.is-expanded]:w-6 in-[.is-expanded]:bottom-2.75"></span>
            </span>
          </button>

          <div className="min-[484px]:items-center min-[484px]:flex min-[484px]:h-18 min-[484px]:justify-between min-[484px]:min-h-13.75 min-[484px]:pt-0 min-[484px]:px-5 min-[484px]:whitespace-nowrap max-[483px]:justify-self-center">
            <Link
              aria-label="Apple Music"
              role="img"
              href="/home"
              onClick={closeNavigation}
              className="[--linkHoverTextDecoration:none] inline-block relative z-(--z-default) before:content-[''] before:inset-[-12px_-15px] before:p-[12px_15px] before:absolute"
            >
              <AppleMusicLogo />
            </Link>
          </div>

          {isMobile && (
            <div className="items-center max-[483px]:[justify-self:end]">
              <div className="max-[483px]:in-[.app-container]:me-0">
                <Link
                  href="/profile"
                  aria-label="My Profile"
                  onClick={closeNavigation}
                  className="m-0 p-0 block [border:0] outline-none appearance-none [font:inherit] [font-size:inherit] leading-[inherit] rounded-(--ctxmenu-trigger-border-radius,50%) bg-(--ctxmenu-trigger-background-color,transparent) [transition:opacity_0.1s_ease-in] opacity-(--ctxmenu-trigger-opacity,1) cursor-pointer [backdrop-filter:blur(var(--ctxmenu-trigger-backdrop-blur,0))] no-underline"
                >
                  <span className="flex rounded-[50%]">
                    <Image
                      src={user?.avatarUrl || "/assets/avatar.webp"}
                      alt="avatar"
                      height={24}
                      width={24}
                      className="max-[999px]:h-7 max-[999px]:w-7 rounded-[inherit] object-cover"
                    />
                  </span>
                </Link>
              </div>
            </div>
          )}
        </div>

        <div
          id="navigation"
          className="flex flex-col overflow-hidden min-[484px]:flex-1 min-[484px]:w-(--web-navigation-width) min-[484px]:in-[.app-container]:[--navigation-scroll-container-offset:36px] min-[484px]:in-[.app-container]:[--navigation-mask-height:36px] min-[484px]:in-[.app-container]:[--navigation-scrollbar-width:12px] min-[484px]:in-[.app-container]:-mt-(--navigation-scroll-container-offset) min-[484px]:in-[.app-container]:mask-[linear-gradient(transparent,#000_var(--navigation-mask-height)),linear-gradient(var(--navigation-scroll-mask-direction,to_left),#000_var(--navigation-scrollbar-width),transparent_var(--navigation-scrollbar-width))] min-[484px]:in-[.app-container]:w-[unset]"
        >
          <div className="overflow-y-auto scroll-smooth min-[484px]:flex-1 min-[484px]:in-[.app-container]:px-3 min-[484px]:in-[.app-container]:pt-(--navigation-scroll-container-offset) max-[483px]:pt-5.75 max-[483px]:in-[.app-container]:p-4">
            <SidebarSection
              items={primaryNavigationItems}
              pathname={pathname}
              onNavigate={closeNavigation}
            />
            <SidebarSection
              items={roomNavigationItems}
              pathname={pathname}
              onNavigate={closeNavigation}
              onExternalNavigate={openRoom}
            />
            <SidebarSection
              key={`library-pins-${pinnedResources.length}`}
              title="Library"
              items={visibleLibraryItems}
              pathname={pathname}
              onNavigate={closeNavigation}
            />
            <SidebarSection
              title="Playlists"
              items={visiblePlaylistItems}
              pathname={pathname}
              onNavigate={closeNavigation}
            />
            {canManageIdentity && (
              <SidebarSection
                title="Administration"
                items={identityAdminItems}
                pathname={pathname}
                onNavigate={closeNavigation}
              />
            )}
          </div>

          <div className="navigation__native-cta">
            <div slot="native-cta">
              <div className="[border-top:.5px_solid_rgba(0,0,0,.1)] [font:var(--body)] mx-6.25 py-3 text-(--systemPrimary) max-[483px]:mx-3 in-[.is-expanded]:h-14.25 min-[484px]:mx-0 min-[484px]:px-3 min-[484px]:py-4">
                <button className="flex items-center justify-start w-full">
                  <span className="leading-0">
                    <div className="fill-(--systemSecondary) shrink-0 h-8 me-1.5 ms-1.5 w-8 min-[484px]:h-5.5 min-[484px]:w-5.5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 114.927 120"
                        aria-hidden="true"
                      >
                        <path
                          d="M39.031 104.974h36.871c8.557 0 15.243-2.491 19.635-6.883 4.547-4.444 6.935-11.141 6.935-19.688V41.595c0-8.546-2.377-15.233-6.935-19.687-4.454-4.454-11.078-6.883-19.635-6.883H39.031c-8.556 0-15.295 2.491-19.687 6.883-4.495 4.444-6.883 11.141-6.883 19.687v36.808c0 8.547 2.377 15.234 6.883 19.688 4.413 4.413 11.131 6.883 19.687 6.883zm0-7.854c-6.09 0-10.808-1.724-13.906-4.759-3.138-3.149-4.811-7.815-4.811-13.958V41.595c0-6.142 1.673-10.808 4.811-13.957 3.046-2.983 7.816-4.759 13.906-4.759h36.871c6.039 0 10.798 1.724 13.895 4.759 3.149 3.149 4.822 7.815 4.822 13.957v36.808c0 6.143-1.673 10.809-4.822 13.958-3.045 2.983-7.856 4.759-13.895 4.759z"
                          fill="currentColor"
                        ></path>
                        <path
                          d="M41.091 86.083c3.593 0 9.188-2.71 9.188-9.874V53.468c0-1.05.146-1.206 1.071-1.404l19.664-4.018c1.05-.197 1.384-.031 1.384.791l.124 15.265c0 1.039-.53 1.766-1.528 1.964l-3.613.81c-5.005 1.111-7.507 3.446-7.507 7.257 0 3.861 3.052 6.623 7.299 6.623 3.592 0 9.063-2.575 9.063-9.801V37.124c0-2.543-1.193-3.322-4.058-2.709l-23.215 4.766c-1.713.363-2.72 1.328-2.72 2.885l.125 27.414c0 1.039-.406 1.59-1.268 1.788l-3.801.747c-4.932.987-7.392 3.551-7.392 7.496 0 3.862 3 6.572 7.184 6.572z"
                          fill="currentColor"
                        ></path>
                      </svg>
                    </div>
                  </span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-(--systemPrimary) [font:var(--title-navigation)]">
                    Open in Music
                  </span>

                  <span>
                    <svg
                      height="16"
                      width="16"
                      viewBox="0 0 16 16"
                      className="fill-(--systemPrimary) shrink-0 h-2.25 w-2.25 m-[0_4px]"
                      aria-hidden="true"
                    >
                      <path d="M1.559 16 13.795 3.764v8.962H16V0H3.274v2.205h8.962L0 14.441 1.559 16z"></path>
                    </svg>
                  </span>
                </button>
              </div>

              {isMobile === false && (
                <div className="mx-3 mb-5">
                  <div className="self-center">
                    <div className="top-1.25 w-full">
                      <div className="p-1.5 rounded-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-between gap-2 shadow-sm">
                        <Link
                          href="/profile"
                          className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80 transition"
                          aria-label="My Profile"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-black text-white shadow-sm border border-neutral-800">
                            <Image
                              src={user?.avatarUrl || "/assets/avatar.webp"}
                              alt="avatar"
                              height={36}
                              width={36}
                              className="size-full rounded-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-(--systemPrimary)">
                              {user?.displayName || user?.username || "Account"}
                            </p>
                            <p className="truncate text-[10px] font-semibold text-amber-500 flex items-center gap-1 mt-0.5">
                              <Coins className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                {(balance?.coinBalance ?? 0).toLocaleString()}{" "}
                                Coin
                              </span>
                            </p>
                          </div>
                        </Link>

                        <Link
                          href="/settings/account"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-(--labelDivider) bg-(--systemQuinary) text-(--systemPrimary) transition hover:bg-(--systemQuaternary)"
                          title="Settings"
                          aria-label="Settings"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </Link>

                        <Link
                          href="/deposit"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--keyColor) hover:bg-(--keyColor)/90 text-white shadow transition-all cursor-pointer"
                          title="Nạp Coin"
                        >
                          <Plus className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
}
