"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth-store";
import { http } from "@/lib/api/http";
import { useWalletBalance } from "@/lib/wallet/use-wallet-balance";
import { Coins, Plus, ShieldCheck } from "lucide-react";
import Image from "next/image";

type SidebarItem = {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
};

type UserPlaylist = {
  id: string;
  name: string;
};

const primaryNavigationItems: SidebarItem[] = [
  {
    key: "search",
    label: "Search",
    href: "/search",
    icon: (
      <svg height="24" viewBox="0 0 24 24" width="24" aria-hidden="true">
        <path
          d="M17.979 18.553c.476 0 .813-.366.813-.835a.807.807 0 0 0-.235-.586l-3.45-3.457a5.61 5.61 0 0 0 1.158-3.413c0-3.098-2.535-5.633-5.633-5.633C7.542 4.63 5 7.156 5 10.262c0 3.098 2.534 5.632 5.632 5.632a5.614 5.614 0 0 0 3.274-1.055l3.472 3.472a.835.835 0 0 0 .6.242zm-7.347-3.875c-2.417 0-4.416-2-4.416-4.416 0-2.417 2-4.417 4.416-4.417 2.417 0 4.417 2 4.417 4.417s-2 4.416-4.417 4.416z"
          fillOpacity=".95"
        />
      </svg>
    ),
  },
  {
    key: "home",
    label: "Home",
    href: "/home",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M5.93 20.16a1.94 1.94 0 0 1-1.43-.502c-.334-.335-.502-.794-.502-1.393v-7.142c0-.362.062-.688.177-.953.123-.264.326-.529.6-.75l6.145-5.157c.176-.141.344-.247.52-.318.176-.07.362-.105.564-.105.194 0 .388.035.565.105.176.07.352.177.52.318l6.146 5.158c.273.23.467.476.59.75.124.264.177.59.177.96v7.134c0 .59-.159 1.058-.503 1.393-.335.335-.811.503-1.428.503H5.929Zm12.14-1.172c.221 0 .406-.07.547-.212a.688.688 0 0 0 .22-.511v-7.142c0-.177-.026-.344-.087-.459a.97.97 0 0 0-.265-.353l-6.154-5.149a.756.756 0 0 0-.177-.115.37.37 0 0 0-.15-.035.37.37 0 0 0-.158.035l-.177.115-6.145 5.15a.982.982 0 0 0-.274.352 1.13 1.13 0 0 0-.088.468v7.133c0 .203.08.379.23.511a.744.744 0 0 0 .546.212h12.133Zm-8.323-4.7c0-.176.062-.326.177-.432a.6.6 0 0 1 .423-.159h3.315c.176 0 .326.053.432.16s.159.255.159.431v4.973H9.756v-4.973Z" />
      </svg>
    ),
  },
  {
    key: "new",
    label: "New",
    href: "/#",
    icon: (
      <svg height="24" viewBox="0 0 24 24" width="24" aria-hidden="true">
        <path
          d="M9.92 11.354c.966 0 1.453-.487 1.453-1.49v-3.4c0-1.004-.487-1.483-1.453-1.483H6.452C5.487 4.981 5 5.46 5 6.464v3.4c0 1.003.487 1.49 1.452 1.49zm7.628 0c.965 0 1.452-.487 1.452-1.49v-3.4c0-1.004-.487-1.483-1.452-1.483h-3.46c-.974 0-1.46.479-1.46 1.483v3.4c0 1.003.486 1.49 1.46 1.49zm-7.65-1.073h-3.43c-.266 0-.396-.137-.396-.418v-3.4c0-.273.13-.41.396-.41h3.43c.265 0 .402.137.402.41v3.4c0 .281-.137.418-.403.418zm7.634 0h-3.43c-.273 0-.402-.137-.402-.418v-3.4c0-.273.129-.41.403-.41h3.43c.265 0 .395.137.395.41v3.4c0 .281-.13.418-.396.418zm-7.612 8.7c.966 0 1.453-.48 1.453-1.483v-3.407c0-.996-.487-1.483-1.453-1.483H6.452c-.965 0-1.452.487-1.452 1.483v3.407c0 1.004.487 1.483 1.452 1.483zm7.628 0c.965 0 1.452-.48 1.452-1.483v-3.407c0-.996-.487-1.483-1.452-1.483h-3.46c-.974 0-1.46.487-1.46 1.483v3.407c0 1.004.486 1.483 1.46 1.483zm-7.65-1.072h-3.43c-.266 0-.396-.137-.396-.41v-3.4c0-.282.13-.418.396-.418h3.43c.265 0 .402.136.402.418v3.4c0 .273-.137.41-.403.41zm7.634 0h-3.43c-.273 0-.402-.137-.402-.41v-3.4c0-.282.129-.418.403-.418h3.43c.265 0 .395.136.395.418v3.4c0 .273-.13.41-.396.41z"
          fillOpacity=".95"
        />
      </svg>
    ),
  },
];

const libraryItems: SidebarItem[] = [
  {
    key: "recently-added",
    label: "Recently Added",
    href: "/#",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M12 20c4.376 0 8-3.631 8-8 0-4.376-3.631-8-8.008-8C7.624 4 4 7.624 4 12c0 4.369 3.631 8 8 8zm0-1.333A6.634 6.634 0 0 1 5.341 12a6.628 6.628 0 0 1 6.651-6.667A6.653 6.653 0 0 1 18.667 12 6.636 6.636 0 0 1 12 18.667zm-.008-5.82a.54.54 0 0 0 .55-.549V7.012a.54.54 0 0 0-.55-.541.532.532 0 0 0-.541.54v4.746H7.898a.534.534 0 0 0-.549.541c0 .314.235.55.549.55h4.094z"></path>
      </svg>
    ),
  },
  {
    key: "artists",
    label: "Artists",
    href: "/#",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M18.39 9.42c1.289-1.282 1.34-2.908.102-4.139-1.23-1.216-2.85-1.186-4.138.103l4.036 4.035zm-6.08 9.858a.66.66 0 0 0 .667-.667v-4.328l-.051-1.048 2.234-2.072c.842.11 1.728-.235 2.49-1.004l-4.03-4.035c-.776.761-1.098 1.633-.988 2.475l-6.805 7.332c-.278.3-.322.717.022 1.062L4.913 18.2a.31.31 0 0 0 .037.418l.212.22a.309.309 0 0 0 .425.029l1.208-.945c.33.344.755.3 1.048.022l3.8-3.516v4.182a.66.66 0 0 0 .667.667zm-5.053-2.073-.674-.674 6.453-6.84c.124.205.278.402.461.593.183.183.373.344.571.476l-6.811 6.445z"></path>
      </svg>
    ),
  },
  {
    key: "albums",
    label: "Albums",
    href: "/#",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M15.477 3.937c-.044-.61-.396-.937-1.07-.937H9.431c-.675 0-1.027.327-1.07.937h7.115zm1.24 2.013c-.11-.654-.425-1.025-1.159-1.025H8.222c-.741 0-1.057.37-1.167 1.025h9.662zm-.3 14.05c1.313 0 2.083-.756 2.083-2.252v-8.37c0-1.496-.778-2.252-2.304-2.252H7.804C6.27 7.126 5.5 7.875 5.5 9.38v8.369C5.5 19.244 6.27 20 7.804 20h8.612zm-.023-1.17H7.818c-.733 0-1.137-.392-1.137-1.148V9.437c0-.756.404-1.14 1.137-1.14h8.356c.727 0 1.145.384 1.145 1.14v8.245c0 .756-.418 1.148-.925 1.148z"></path>
      </svg>
    ),
  },
  {
    key: "songs",
    label: "Songs",
    href: "/#",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M9.732 19.241c1.077 0 2.688-.79 2.688-2.922V9.617c0-.388.074-.469.418-.542l3.347-.732a.48.48 0 0 0 .403-.484V5.105c0-.388-.315-.637-.689-.563l-3.764.82c-.47.102-.725.359-.725.769l.014 8.144c.037.36-.132.594-.454.66l-1.164.241c-1.465.308-2.154 1.055-2.154 2.16 0 1.122.864 1.905 2.08 1.905z"></path>
      </svg>
    ),
  },
  {
    key: "made-for-you",
    label: "Made for You",
    href: "/#",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M6.729 20.011H17.27c1.825 0 2.729-.903 2.729-2.694V6.706c0-1.79-.904-2.695-2.729-2.695H6.73C4.913 4.011 4 4.906 4 6.706v10.611c0 1.8.913 2.694 2.729 2.694zm5.275-5.101c-3.085 0-5.31 1.486-6.24 3.372-.243-.235-.365-.574-.365-1.034V6.775c0-.904.478-1.365 1.347-1.365h10.508c.86 0 1.347.461 1.347 1.365v10.473c0 .451-.122.8-.356 1.025-.93-1.886-3.086-3.363-6.24-3.363zm0-1.452c1.66.018 2.964-1.399 2.964-3.259 0-1.747-1.304-3.19-2.964-3.19s-2.98 1.443-2.972 3.19c.009 1.86 1.312 3.233 2.972 3.26z"></path>
      </svg>
    ),
  },
];

const playlistItems: SidebarItem[] = [
  {
    key: "all-playlists",
    label: "All Playlists",
    href: "/library/all-playlists/",
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M5.55 8.73H7.4c.45 0 .8-.13 1.06-.38.25-.26.37-.62.37-1.1V5.5c0-.46-.12-.83-.37-1.08-.26-.26-.6-.39-1.06-.39H5.55c-.45 0-.8.13-1.06.39-.25.25-.37.62-.37 1.08v1.77c0 .47.12.83.37 1.09.26.25.6.38 1.06.38Zm.16-1.14c-.15 0-.26-.04-.34-.12-.07-.07-.1-.2-.1-.35V5.63c0-.15.03-.27.1-.35.08-.07.2-.11.34-.11h1.52c.14 0 .25.04.34.11.08.08.12.2.12.35v1.49c0 .16-.04.28-.12.35a.46.46 0 0 1-.34.12H5.7Zm5.62 1.14h1.84c.46 0 .8-.13 1.06-.38.25-.26.37-.62.37-1.1V5.5c0-.46-.12-.83-.37-1.08a1.4 1.4 0 0 0-1.06-.39h-1.84c-.45 0-.8.13-1.05.39A1.5 1.5 0 0 0 9.9 5.5v1.77c0 .47.13.83.38 1.09.25.25.6.38 1.05.38Zm.16-1.14c-.15 0-.26-.04-.34-.12-.07-.07-.11-.2-.11-.35V5.63c0-.15.04-.27.11-.35.08-.07.19-.11.34-.11h1.53c.14 0 .25.04.33.11.08.08.11.2.11.35v1.49c0 .16-.04.28-.11.35-.08.08-.2.12-.33.12h-1.53Zm5.63 1.14h1.84c.45 0 .8-.13 1.06-.38.25-.26.38-.62.38-1.1V5.5c0-.46-.13-.83-.38-1.08-.25-.26-.6-.39-1.06-.39h-1.84c-.45 0-.8.13-1.05.39-.26.25-.38.62-.38 1.08v1.77c0 .47.12.83.38 1.09.25.25.6.38 1.05.38Zm.16-1.14c-.15 0-.26-.04-.34-.12-.08-.07-.12-.2-.12-.35V5.63c0-.15.04-.27.12-.35.08-.07.2-.11.34-.11h1.52c.14 0 .25.04.33.11.08.08.12.2.12.35v1.49c0 .16-.04.28-.12.35-.07.08-.18.12-.33.12h-1.52ZM5.55 14.35H7.4c.45 0 .8-.13 1.06-.38.25-.26.37-.62.37-1.08V11.1c0-.47-.12-.83-.37-1.09-.26-.25-.6-.38-1.06-.38H5.55c-.45 0-.8.13-1.06.38-.25.26-.37.62-.37 1.09v1.78c0 .46.12.82.37 1.08.26.25.6.38 1.06.38Zm.16-1.14c-.15 0-.26-.04-.34-.12-.07-.08-.1-.2-.1-.35v-1.5c0-.15.03-.26.1-.34.08-.08.2-.12.34-.12h1.52c.14 0 .25.04.34.12.08.08.12.2.12.34v1.5c0 .15-.04.27-.12.35a.45.45 0 0 1-.34.12H5.7Zm5.62 1.14h1.84c.46 0 .8-.13 1.06-.38.25-.26.37-.62.37-1.08V11.1c0-.47-.12-.83-.37-1.09a1.4 1.4 0 0 0-1.06-.38h-1.84c-.45 0-.8.13-1.05.38-.25.26-.38.62-.38 1.09v1.78c0 .46.13.82.38 1.08.25.25.6.38 1.05.38Zm.16-1.14c-.15 0-.26-.04-.34-.12a.523.523 0 0 1-.11-.35v-1.5c0-.15.04-.26.11-.34.08-.08.19-.12.34-.12h1.53c.14 0 .25.04.33.12.08.08.11.2.11.34v1.5c0 .15-.04.27-.11.35-.08.08-.2.12-.33.12h-1.53Zm5.63 1.14h1.84c.45 0 .8-.13 1.06-.38.25-.26.38-.62.38-1.08V11.1c0-.47-.13-.83-.38-1.09-.25-.25-.6-.38-1.06-.38h-1.84c-.45 0-.8.13-1.05.38-.26.26-.38.62-.38 1.09v1.78c0 .46.12.82.38 1.08.25.25.6.38 1.05.38Zm.16-1.14c-.15 0-.26-.04-.34-.12-.08-.08-.12-.2-.12-.35v-1.5c0-.15.04-.26.12-.34.08-.08.2-.12.34-.12h1.52c.14 0 .25.04.33.12.08.08.12.2.12.34v1.5c0 .15-.04.27-.12.35-.07.08-.18.12-.33.12h-1.52ZM5.55 19.97H7.4c.45 0 .8-.13 1.06-.38.25-.26.37-.62.37-1.1v-1.76c0-.47-.12-.83-.37-1.09-.26-.25-.6-.38-1.06-.38H5.55c-.45 0-.8.13-1.06.38-.25.26-.37.62-.37 1.09v1.77c0 .47.12.83.37 1.09.26.25.6.38 1.06.38Zm.16-1.15c-.15 0-.26-.04-.34-.11-.07-.08-.1-.2-.1-.35v-1.49c0-.16.03-.28.1-.36.08-.07.2-.11.34-.11h1.52c.14 0 .25.04.34.11.08.08.12.2.12.36v1.49c0 .15-.04.27-.12.35a.46.46 0 0 1-.34.11H5.7Zm5.62 1.15h1.84c.46 0 .8-.13 1.06-.38.25-.26.37-.62.37-1.1v-1.76c0-.47-.12-.83-.37-1.09a1.4 1.4 0 0 0-1.06-.38h-1.84c-.45 0-.8.13-1.05.38-.25.26-.38.62-.38 1.09v1.77c0 .47.13.83.38 1.09.25.25.6.38 1.05.38Zm.16-1.15c-.15 0-.26-.04-.34-.11a.523.523 0 0 1-.11-.35v-1.49c0-.16.04-.28.11-.36.08-.07.19-.11.34-.11h1.53c.14 0 .25.04.33.11.08.08.11.2.11.36v1.49c0 .15-.04.27-.11.35-.08.07-.2.11-.33.11h-1.53Zm5.63 1.15h1.84c.45 0 .8-.13 1.06-.38.25-.26.38-.62.38-1.1v-1.76c0-.47-.13-.83-.38-1.09-.25-.25-.6-.38-1.06-.38h-1.84c-.45 0-.8.13-1.05.38-.26.26-.38.62-.38 1.09v1.77c0 .47.12.83.38 1.09.25.25.6.38 1.05.38Zm.16-1.15c-.15 0-.26-.04-.34-.11-.08-.08-.12-.2-.12-.35v-1.49c0-.16.04-.28.12-.36.08-.07.2-.11.34-.11h1.52c.14 0 .25.04.33.11.08.08.12.2.12.36v1.49c0 .15-.04.27-.12.35-.07.07-.18.11-.33.11h-1.52Z"
          transform="translate(.7 .94) scale(.92237)"
          style={{ fillRule: "nonzero" }}
        ></path>
      </svg>
    ),
  },
  {
    key: "favourite-songs",
    label: "Favourite Songs",
    href: "/library#favourite-songs",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        style={{ overflow: "visible" }}
        aria-hidden="true"
      >
        <path d="M6.7 20h10.5c1.8 0 2.7-.9 2.7-2.7V6.7C20 4.9 19.1 4 17.3 4H6.7C4.9 4 4 4.9 4 6.7v10.6c0 1.8.9 2.7 2.7 2.7zm0-1.4c-.9 0-1.4-.5-1.4-1.4V6.8c0-.9.5-1.4 1.4-1.4h10.5c.9 0 1.4.5 1.4 1.4v10.5c0 .9-.5 1.4-1.4 1.4l-10.5-.1z"></path>
        <path d="m9.5 16.5 2.5-1.8 2.5 1.8c.5.4 1 0 .8-.6l-1-3 2.5-1.8c.5-.3.3-1-.3-1h-3.1l-.9-3c-.2-.6-.9-.6-1 0l-.9 3H7.5c-.6 0-.8.7-.3 1l2.5 1.8-1 3c-.2.6.3 1 .8.6z"></path>
      </svg>
    ),
  },
];

function PlaylistIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.079 19.712c1.076 0 2.688-.79 2.688-2.922v-6.702c0-.388.073-.468.417-.542l3.347-.732a.48.48 0 0 0 .403-.483V5.577c0-.388-.315-.637-.688-.564l-3.765.82c-.469.103-.725.359-.725.77l.015 8.144c.036.359-.132.593-.455.659l-1.164.242c-1.465.307-2.153 1.054-2.153 2.16 0 1.12.864 1.904 2.08 1.904zM12.046 8.675a.503.503 0 0 0 .498-.498.497.497 0 0 0-.498-.49H5.498a.492.492 0 0 0-.498.49.5.5 0 0 0 .498.498h6.548zm0 2.607a.5.5 0 0 0 .498-.505.49.49 0 0 0-.498-.483H5.498a.486.486 0 0 0-.498.483c0 .278.212.505.498.505h6.548zm0 2.608a.494.494 0 1 0 0-.989H5.498a.492.492 0 0 0-.498.49.49.49 0 0 0 .498.499h6.548z" />
    </svg>
  );
}

const identityAdminItems: SidebarItem[] = [
  {
    key: "admin",
    label: "Admin",
    href: "/admin",
    icon: <ShieldCheck className="h-5 w-5" aria-hidden="true" />,
  },
];

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

function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarSection({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title?: string;
  items: SidebarItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="pt-0 in-[.app-container]:[--navigation-item-height:44px] min-[484px]:in-[.app-container]:[--navigation-item-height:36px]">
      {title && (
        <div className="text-(--systemSecondary) flex [font:var(--body-emphasized)] justify-between p-[15px_26px_3px] in-[.app-container]:items-end h-(--navigation-item-height) px-1.5 py-2 min-[484px]:[font:var(--callout-emphasized)] min-[484px]:m-[0_0_4px] min-[484px]:p-[4px_8px] min-[484px]:rounded-md">
          <span>{title}</span>
        </div>
      )}

      <ul className="p-0 [font:var(--title-navigation)]">
        {items.map((item) => {
          const isSelected = isActiveRoute(pathname, item.href);

          return (
            <li
              key={item.key}
              className={[
                "[--linkHoverTextDecoration:none] rounded-md mb-0.5 p-1 relative in-[.app-container]:rounded-lg in-[.app-container]:h-(--navigation-item-height) in-[.app-container]:mb-1 min-[484px]:in-[.app-container]:list-item ",
                isSelected ? "bg-(--navSidebarSelectedState)" : "",
              ].join(" ")}
            >
              <Link
                href={item.href}
                onClick={onNavigate}
                className="rounded-[inherit] box-content block h-full -m-0.75 p-0.75"
                aria-current={isSelected ? "page" : undefined}
              >
                <div
                  className={[
                    "items-center rounded-[inherit] flex gap-2 size-full in-[.app-container]:gap-1.5 min-[484px]:in-[.app-container]:gap-0.5",
                    isSelected
                      ? "text-(--keyColor)"
                      : "text-(--navigation-item-text-color,var(--systemPrimary))",
                  ].join(" ")}
                >
                  <span
                    className={`max-[483px]:basis-(--navigation-item-icon-size,28px) flex-[0_0] basis-(--navigation-item-icon-size,32px) leading-0 in-[.app-container]:mx-0.5 min-[484px]:basis-(--navigation-item-icon-size,24px) [&>svg]:h-full [&>svg]:w-full ${isSelected ? "[&>svg]:fill-(--keyColor)" : "[&>svg]:fill-(--navigation-item-icon-color,var(--systemPrimary))"}`}
                  >
                    {item.icon}
                  </span>

                  <span className="flex-1 -m-1 overflow-hidden p-1 text-ellipsis whitespace-nowrap text-left">
                    {item.label}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 483px)");
    const update = () => setIsMobile(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export default function AppSidebar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>([]);
  const canManageIdentity = [
    "SUPER_ADMIN",
    "ADMIN_USER_OPS",
    "ADMIN_SECURITY_OPS",
  ].includes(user?.role ?? "");
  const { balance } = useWalletBalance();

  useEffect(() => {
    if (!user?.userId) {
      return;
    }

    let active = true;
    const loadPlaylists = async () => {
      try {
        const response = await http.get(
          `/playlists/user/${encodeURIComponent(user.userId)}`,
          { params: { limit: 50 } },
        );
        if (!active) return;
        setUserPlaylists(
          response.data.playlists ?? response.data.data?.playlists ?? [],
        );
      } catch {
        if (active) setUserPlaylists([]);
      }
    };

    void loadPlaylists();
    window.addEventListener("library:playlists-changed", loadPlaylists);
    return () => {
      active = false;
      window.removeEventListener("library:playlists-changed", loadPlaylists);
    };
  }, [user?.userId]);

  const visiblePlaylistItems: SidebarItem[] = [
    ...playlistItems.slice(0, 2),
    ...(user?.userId ? userPlaylists : []).map((playlist) => ({
      key: `user-playlist-${playlist.id}`,
      label: playlist.name,
      href: `/playlist/${playlist.id}`,
      icon: <PlaylistIcon />,
    })),
  ];

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
          <div className="overflow-y-auto scroll-smooth min-[484px]:flex-1 min-[484px]:in-[.app-container]:px-3 min-[484px]:in-[.app-container]:pt-(--navigation-scroll-container-offset) min-[484px]:in-[.app-container]:scrollbar-thin max-[483px]:pt-5.75 max-[483px]:in-[.app-container]:p-4">
            <SidebarSection
              items={primaryNavigationItems}
              pathname={pathname}
              onNavigate={closeNavigation}
            />
            <SidebarSection
              title="Library"
              items={libraryItems}
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
