"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth-store";
import { http } from "@/lib/api/http";
import { useWalletBalance } from "@/lib/wallet/use-wallet-balance";
import { useMenuStore } from "@/lib/menu/use-menu-store";
import Image from "next/image";
import { useIsMobile } from "./sidebar/use-is-mobile";
import { useUserPlaylists } from "./sidebar/use-user-playlists";
import { usePinnedLibraryResources } from "./sidebar/use-pinned-library-resources";
import { useLibraryMediaCards } from "@/lib/library/use-library-media-cards";
import { ensureFavoriteLibraryResource } from "@/lib/favorites/ensure-favorite-library-resource";
import { PlaylistIcon } from "./sidebar/playlist-icon";
import { albumRoute } from "@/lib/catalog/album-route";
import {
  libraryItems,
  playlistItems,
  primaryNavigationItems,
  roomNavigationItems,
} from "./sidebar/sidebar-data";
import { SidebarSection } from "./sidebar/sidebar-section";
import type { SidebarItem } from "./sidebar/sidebar-types";
import Coin from "../icons/coin-icon";

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
  const { resources: libraryMediaCards } = useLibraryMediaCards({
    userId: user?.userId,
    errorMessage: "Couldn't load Library playlists",
  });

  useEffect(() => {
    if (user?.userId) {
      // This is a background bootstrap; page-level callers handle visible
      // errors themselves, so do not leave a global unhandled rejection here.
      void ensureFavoriteLibraryResource().catch(() => undefined);
    }
  }, [user?.userId]);
  const { balance } = useWalletBalance();
  const openMenu = useMenuStore((state) => state.openMenu);
  const closeMenu = useMenuStore((state) => state.closeMenu);
  const isAccountMenuOpen = useMenuStore(
    (state) => state.isOpen && state.activeId === "sidebar-account-menu",
  );

  const visiblePlaylistItems: SidebarItem[] = [
    ...playlistItems.slice(0, 2),
    ...(user?.userId ? userPlaylists : []).map((playlist) => ({
      key: `user-playlist-${playlist.id}`,
      label: playlist.name,
      href: `/library/playlist/${playlist.id}`,
      icon: <PlaylistIcon />,
    })),
    ...libraryMediaCards
      .filter(
        (resource) =>
          resource.resourceType === "playlists" &&
          Boolean(resource.catalogUrl) &&
          !resource.catalogUrl.startsWith("/library/playlist/"),
      )
      .filter(
        (resource) =>
          !userPlaylists.some(
            (playlist) => playlist.id === resource.resourceId,
          ),
      )
      .map((playlist) => ({
        key: `library-playlist-${playlist.resourceId}`,
        label: playlist.title || playlist.resourceId,
        href: `/library/playlist/${encodeURIComponent(playlist.resourceId)}`,
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
              ? "/library/songs"
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

  const openAccountMenu = (event: MouseEvent<HTMLButtonElement>) => {
    if (isAccountMenuOpen) {
      closeMenu();
      return;
    }

    const anchorPoint =
      event.detail === 0 ? undefined : { x: event.clientX, y: event.clientY };

    openMenu(
      {
        id: "sidebar-account-menu",
        anchorPoint,
        items: [
          {
            id: "top-up",
            label: "Top Up",
            href: "/deposit",
            onNavigate: closeNavigation,
          },
          {
            id: "account",
            label: "Account",
            href: "/account",
            onNavigate: closeNavigation,
            icon: (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 512 512"
                width="100%"
                height="100%"
                aria-hidden="true"
              >
                <g
                  transform="translate(0,512) scale(0.1,-0.1)"
                  fill="currentColor"
                  fillRule="evenodd"
                  stroke="currentColor"
                  strokeWidth="90"
                  strokeLinejoin="round"
                >
                  <path d="M2365 4683 c-394 -84 -706 -426 -782 -858 -22 -129 -13 -337 20 -466 128 -491 536 -817 997 -796 416 19 767 308 903 742 39 123 50 228 44 394 -4 114 -11 167 -31 241 -36 129 -120 296 -201 397 -143 179 -368 313 -589 352 -84 15 -278 12 -361 -6z m372 -358 c224 -76 389 -277 433 -531 16 -89 8 -287 -14 -369 -9 -33 -37 -103 -63 -155 -39 -79 -60 -109 -132 -180 -135 -134 -266 -188 -431 -177 -331 21 -590 340 -590 727 0 223 77 410 230 554 115 108 231 154 393 155 80 1 112 -4 174 -24z" />
                  <path d="M2360 2264 c-361 -41 -592 -105 -855 -236 -510 -254 -889 -711 -946 -1142 -27 -207 25 -328 174 -401 151 -74 45 -70 1827 -70 1782 0 1676 -4 1827 70 149 73 201 194 174 401 -32 236 -175 511 -383 730 -313 331 -760 554 -1258 629 -109 16 -475 29 -560 19z m540 -369 c361 -60 669 -199 916 -412 212 -184 360 -424 380 -619 6 -53 4 -61 -16 -79 -22 -20 -36 -20 -1622 -20 l-1600 0 -20 25 c-17 21 -19 34 -14 80 17 140 104 315 231 462 280 325 704 529 1210 582 88 9 443 -3 535 -19z" />
                </g>
              </svg>
            ),
          },
          {
            id: "settings",
            label: "Settings",
            href: "/settings",
            onNavigate: closeNavigation,
            icon: (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="100%"
                height="100%"
                fillRule="evenodd"
                strokeLinejoin="round"
                strokeMiterlimit="2"
                clipRule="evenodd"
                viewBox="0 0 16 16"
              >
                <path
                  fillRule="nonzero"
                  d="M31.475,57.622C32.114,57.622 32.702,57.571 33.34,57.52L34.77,60.228C35.077,60.891 35.766,61.249 36.558,61.12C37.298,60.994 37.809,60.43 37.912,59.665L38.346,56.651C39.546,56.32 40.696,55.885 41.845,55.4L44.066,57.392C44.629,57.928 45.369,58.031 46.085,57.648C46.749,57.263 47.005,56.575 46.877,55.809L46.238,52.82C47.26,52.115 48.218,51.321 49.098,50.445L51.883,51.62C52.597,51.928 53.313,51.748 53.849,51.11C54.334,50.548 54.411,49.806 53.977,49.143L52.367,46.537C53.079,45.524 53.695,44.446 54.207,43.318L57.247,43.472C58.012,43.498 58.677,43.089 58.907,42.349C59.163,41.658 58.933,40.876 58.345,40.432L55.945,38.543C56.249,37.393 56.505,36.143 56.606,34.866L59.468,33.946C60.234,33.716 60.694,33.128 60.694,32.362C60.694,31.571 60.234,31.008 59.468,30.752L56.606,29.834C56.505,28.557 56.249,27.357 55.945,26.157L58.318,24.265C58.932,23.806 59.162,23.091 58.906,22.375C58.676,21.66 58.012,21.226 57.245,21.252L54.206,21.38C53.645,20.23 53.083,19.183 52.368,18.135L53.977,15.555C54.387,14.965 54.334,14.17 53.849,13.64C53.312,12.977 52.597,12.825 51.883,13.105L49.098,14.254C48.198,13.4 47.242,12.606 46.237,11.878L46.877,8.915C47.005,8.149 46.723,7.434 46.085,7.077C45.369,6.692 44.629,6.769 44.066,7.332L41.846,9.298C40.702,8.821 39.535,8.404 38.348,8.048L37.914,5.058C37.834,4.32 37.267,3.722 36.534,3.603C35.768,3.5 35.078,3.833 34.772,4.471L33.342,7.178C32.703,7.154 32.115,7.102 31.477,7.102C30.838,7.102 30.251,7.154 29.612,7.178L28.182,4.471C27.849,3.832 27.186,3.501 26.394,3.603C25.654,3.731 25.144,4.293 25.04,5.058L24.606,8.048C23.406,8.405 22.231,8.814 21.108,9.298L18.885,7.332C18.298,6.769 17.583,6.694 16.842,7.077C16.203,7.434 15.949,8.149 16.075,8.942L16.714,11.878C15.709,12.606 14.753,13.4 13.852,14.254L11.069,13.104C10.329,12.824 9.639,12.977 9.077,13.64C8.618,14.179 8.566,14.96 8.949,15.555L10.559,18.135C9.875,19.17 9.269,20.255 8.746,21.38L5.68,21.252C4.941,21.219 4.264,21.677 4.02,22.375C3.79,23.091 3.995,23.806 4.608,24.266L6.982,26.154C6.7,27.354 6.445,28.554 6.343,29.831L3.457,30.751C2.717,30.981 2.282,31.569 2.282,32.36C2.282,33.126 2.717,33.714 3.457,33.945L6.343,34.889C6.445,36.14 6.675,37.392 6.982,38.542L4.606,40.43C4.022,40.877 3.785,41.65 4.018,42.347C4.253,43.052 4.938,43.515 5.68,43.47L8.745,43.316C9.28,44.466 9.868,45.539 10.557,46.534L8.947,49.141C8.551,49.751 8.604,50.554 9.077,51.107C9.64,51.745 10.329,51.924 11.069,51.617L13.828,50.442C14.722,51.312 15.688,52.107 16.714,52.817L16.075,55.807C15.948,56.573 16.203,57.262 16.868,57.645C17.583,58.028 18.298,57.925 18.86,57.415L21.106,55.397C22.231,55.882 23.406,56.317 24.606,56.648L25.04,59.664C25.143,60.428 25.654,60.991 26.394,61.144C27.186,61.247 27.849,60.888 28.182,60.225L29.612,57.517C30.251,57.568 30.838,57.619 31.477,57.619L31.475,57.621L31.475,57.622ZM38.168,30.345C36.891,27.049 34.337,25.262 31.322,25.262C30.762,25.261 30.205,25.33 29.662,25.466L22.766,13.64C25.492,12.368 28.466,11.714 31.474,11.724C42.254,11.724 50.732,19.822 51.729,30.344L38.168,30.344L38.168,30.345ZM11.145,32.362C11.145,25.543 14.286,19.515 19.242,15.762L26.188,27.637C24.834,29.145 24.222,30.752 24.222,32.438C24.222,34.074 24.809,35.58 26.188,37.138L19.063,48.835C14.209,45.055 11.145,39.105 11.145,32.362ZM28.283,32.412C28.283,30.702 29.738,29.374 31.373,29.374C33.085,29.374 34.489,30.702 34.489,32.412C34.481,34.114 33.076,35.509 31.374,35.505C29.738,35.505 28.282,34.125 28.282,32.412L28.283,32.412ZM31.475,53.025C28.257,53.025 25.218,52.285 22.562,50.982L29.637,39.386C30.377,39.565 30.887,39.616 31.322,39.616C34.362,39.616 36.915,37.776 38.168,34.405L51.729,34.405C50.732,44.903 42.252,53.025 31.475,53.025Z"
                  transform="matrix(.27119 0 0 .27119 -.54 -.78)"
                ></path>
              </svg>
            ),
          },
          {
            id: "shared-feedback",
            label: "Shared Feedback",
            icon: (
              <svg
                version="1.0"
                xmlns="http://www.w3.org/2000/svg"
                width="100%"
                height="100%"
                viewBox="0 0 512 512"
              >
                <g
                  transform="translate(0,512) scale(0.100000,-0.100000)"
                  fill="currentColor"
                  fillRule="evenodd"
                  stroke="currentColor"
                  strokeWidth="90"
                  strokeLinejoin="round"
                >
                  <path d="M1145 4533 c-71 -10 -195 -47 -260 -77 -237 -111 -380 -331 -414 -639 -14 -126 -15 -1638 -1 -1762 53 -468 325 -711 818 -732 l142 -6 0 -281 c0 -162 4 -297 10 -318 32 -113 172 -171 288 -118 62 28 81 44 475 397 l360 322 706 3 706 4 95 26 c121 33 197 67 275 123 148 105 242 260 292 480 14 60 17 186 20 910 3 537 0 874 -6 935 -42 382 -227 615 -566 712 l-80 22 -1415 2 c-778 1 -1428 -1 -1445 -3z m2833 -316 c202 -55 319 -180 357 -383 14 -70 15 -203 13 -940 -3 -803 -5 -863 -22 -914 -58 -175 -153 -269 -326 -326 -50 -17 -117 -19 -805 -24 -704 -5 -752 -6 -785 -23 -19 -11 -185 -168 -367 -350 l-333 -332 0 303 c0 326 -4 357 -52 384 -16 9 -89 15 -253 19 -216 5 -235 7 -309 33 -159 54 -245 144 -302 316 -17 51 -19 111 -22 914 -3 935 -2 953 53 1073 69 151 203 239 398 262 40 5 662 8 1382 7 1201 -2 1315 -3 1373 -19z" />
                </g>
              </svg>
            ),
            onClick: () => {
              closeNavigation();
              window.dispatchEvent(new Event("shared-feedback:open"));
            },
          },
        ],
      },
      event.currentTarget,
    );
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
        className={`${isExpanded ? "is-expanded" : ""} [--navigation-border-color-onDark:var(--systemQuinary-onDark)] flex flex-col w-full transform-gpu backface-hidden z-(--z-web-chrome) min-[484px]:[border-inline-end:1px_solid_var(--labelDivider)] min-[484px]:relative dark:[--navigation-shadow-color:rgba(0,0,0,.2)] in-[.app-container]:[--navigation-border-color:var(--glassMaterialInnerStrokeCombined)] in-[.app-container]:[--navigation-shadow-color:rgba(0,0,0,0.1)] in-[.app-container]:[backdrop-filter:saturate(220%)_blur(16px)] in-[.app-container]:bg-(--glassMaterialBackground) in-[.app-container]:[box-shadow:0_10px_40px_var(--glassMaterialShadowColor)] min-[484px]:in-[.app-container]:[border:.5px_solid_var(--navigation-border-color)] min-[484px]:in-[.app-container]:rounded-[20px] min-[484px]:in-[.app-container]:[box-shadow:0_10px_40px_var(--navigation-shadow-color)] min-[484px]:in-[.app-container]:h-[calc(100%-16px)] min-[484px]:in-[.app-container]:mbs-2 min-[484px]:in-[.app-container]:ms-2 min-[484px]:in-[.app-container]:w-[calc(100%-16px)] max-[483px]:h-13 max-[483px]:overflow-hidden max-[483px]:fixed max-[483px]:inset-x-0 max-[483px]:top-0 max-[483px]:in-[.app-container]:shadow-none max-[483px]:[.is-expanded]:h-dvh ${isAnimating ? "will-change-[height] [transition:height_.56s_cubic-bezier(.52,.16,.24,1)]" : ""} max-[483px]:in-[.app-container]:[border-bottom:0.5px_solid_var(--navigation-border-color)] dark:[--navigation-border-color:var(--glassMaterialInnerStrokeCombined-onDark)]  max-[483px]:dark:[--navigation-border-color:var(--navigation-border-color-onDark)] dark:[--glassMaterialBackground:var(--glassMaterialBackground-onDark)]`}
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
                <button
                  type="button"
                  aria-label="Open account menu"
                  aria-haspopup="menu"
                  aria-expanded={isAccountMenuOpen}
                  onClick={openAccountMenu}
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
                </button>
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
                      <button
                        type="button"
                        className="w-full items-center text-(--systemPrimary) grid [font:var(--title-navigation)] font-semibold gap-2 grid-cols-[auto_1fr] justify-items-start ps-2"
                        aria-label="Open account menu"
                        aria-haspopup="menu"
                        aria-expanded={isAccountMenuOpen}
                        onClick={openAccountMenu}
                      >
                        <Image
                          src={user?.avatarUrl || "/assets/avatar.webp"}
                          alt="avatar"
                          height={32}
                          width={32}
                          className="size-8 rounded-full object-cover"
                        />

                        <div className="min-w-0 flex-1 text-left w-full truncate">
                          <span className="font-semibold">
                            {user?.displayName || user?.username || "Account"}
                          </span>

                          <p className="truncate text-[11px] font-semibold dark:text-amber-400 text-[#de8a1d] flex items-center gap-0.75">
                            <Coin />

                            <span>
                              {(balance?.coinBalance ?? 0).toLocaleString()}
                            </span>
                          </p>
                        </div>
                      </button>
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
