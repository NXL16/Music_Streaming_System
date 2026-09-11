"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { addLibraryResource } from "@/lib/library/library-resources.api";
import { useLibraryResourceMembership } from "@/lib/library/use-library-resource-membership";
import { ensureFavoriteLibraryResource } from "@/lib/favorites/ensure-favorite-library-resource";
import {
  confirmLibraryRemoval,
  notifyMenuError,
  notifyMenuSuccess,
} from "@/lib/notifications/menu-toast";
import { LibraryDeleteConfirmationDialog } from "./library-delete-confirmation-dialog";
import { consumeLibraryAlbumOrigin } from "@/lib/library/library-album-origin";
import type { TrackSource } from "@/lib/songs/track-sources";
import type { LibraryResourceType } from "@/lib/library/library-resources.api";

export function AddToLibraryButton({
  resourceType,
  resourceId,
  title,
  subtitle = "",
  artworkUrl = "",
  readOnlySaved = false,
  sourceOrigin,
  songIds,
  trackSources,
  sourceAlbumId,
  isLibraryAlbumView = false,
  variant = "icon",
}: {
  resourceType: LibraryResourceType;
  resourceId: string;
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  /** Ensures the resource exists in Library but prevents user removal here. */
  readOnlySaved?: boolean;
  sourceOrigin?: "catalog" | "favorite" | "user-playlist";
  songIds?: string[];
  trackSources?: TrackSource[];
  sourceAlbumId?: string;
  /** Library Album Detail is saved when its parent membership exists. */
  isLibraryAlbumView?: boolean;
  /** Labelled action used in compact editorial surfaces. */
  variant?: "icon" | "label";
}) {
  const sourceId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"idle" | "loading" | "saved">("idle");
  const [confirming, setConfirming] = useState(false);
  const [labelFeedback, setLabelFeedback] = useState<
    "success" | "fading" | null
  >(null);
  const requiredSongIdsKey = useMemo(
    () => [...new Set(songIds?.filter(Boolean) ?? [])].join(","),
    [songIds],
  );
  const requiredSongIds = useMemo(
    () => (requiredSongIdsKey ? requiredSongIdsKey.split(",") : []),
    [requiredSongIdsKey],
  );
  const libraryMembership = useLibraryResourceMembership({
    resourceType,
    resourceId,
    requiredSongIds,
    isLibraryAlbumView,
  });
  const resolvedStatus =
    status === "loading"
      ? "loading"
      : readOnlySaved || libraryMembership
        ? "saved"
        : libraryMembership === false
          ? "idle"
          : status;
  const activeLabelFeedback =
    libraryMembership === false ? null : labelFeedback;
  const loadingDelay = () =>
    new Promise<void>((resolve) => window.setTimeout(resolve, 300));

  useEffect(() => {
    if (labelFeedback !== "success") return;

    const fadeTimeout = window.setTimeout(
      () => setLabelFeedback("fading"),
      1400,
    );
    const hideTimeout = window.setTimeout(() => setLabelFeedback(null), 1700);

    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(hideTimeout);
    };
  }, [labelFeedback]);

  useEffect(() => {
    if (!readOnlySaved) return;

    let active = true;
    void ensureFavoriteLibraryResource()
      .then(() => {
        if (active) setStatus("saved");
      })
      .catch(() => {
        if (active) setStatus("idle");
      });

    return () => {
      active = false;
    };
  }, [readOnlySaved]);

  async function addToLibrary() {
    if (resolvedStatus !== "idle") return;
    setStatus("loading");
    try {
      await Promise.all([
        addLibraryResource(
          {
            resourceType,
            resourceId,
            title,
            subtitle,
            artworkUrl,
            sourceOrigin,
            songIds,
            trackSources,
            sourceAlbumId,
          },
          sourceId,
        ),
        loadingDelay(),
      ]);
      setStatus("saved");
      if (variant === "label") setLabelFeedback("success");
      notifyMenuSuccess("Added to Library");
    } catch {
      setStatus("idle");
      notifyMenuError("Couldn't add to Library");
    }
  }
  async function removeFromLibrary() {
    setConfirming(false);
    try {
      const { removedEmptyAlbumId } = await confirmLibraryRemoval(
        {
          resourceType,
          resourceId,
          sourceOrigin,
          songIds,
          trackSources,
          sourceAlbumId,
        },
        sourceId,
      );
      setStatus("idle");
      if (
        sourceOrigin === "user-playlist" &&
        pathname === `/library/playlist/${encodeURIComponent(resourceId)}`
      ) {
        router.replace("/home");
      } else if (
        (resourceType === "albums" || removedEmptyAlbumId) &&
        pathname ===
          `/library/albums/${encodeURIComponent(
            removedEmptyAlbumId ?? resourceId,
          )}`
      ) {
        router.replace(
          consumeLibraryAlbumOrigin(removedEmptyAlbumId ?? resourceId) ??
            "/home",
        );
      }
    } catch {
      setStatus("saved");
      notifyMenuError("Couldn't delete from Library");
    }
  }

  function openDeleteConfirmation() {
    if (resolvedStatus !== "saved") return;
    setStatus("loading");
    setConfirming(true);
  }

  async function cancelDeleteConfirmation() {
    setConfirming(false);
    await loadingDelay();
    setStatus("saved");
  }

  if (!readOnlySaved && libraryMembership === undefined) return null;

  if (variant === "label") {
    // Read the shared cache synchronously after its revision changes. This is
    // the same source the context menu uses, so a pending Library deletion
    // cannot be hidden by a delayed local effect.
    if (libraryMembership && !activeLabelFeedback) return null;

    if (status === "loading") {
      return (
        <div className="[--spinnerFillColor:var(--addToLibraryFillOverride)] items-center flex h-(--add-to-library-button-width) justify-center w-(--add-to-library-button-width)">
          <div className="items-center inline-flex h-7 justify-center w-7 fill-(--spinnerFillColor,var(--keyColor)) me-2.5 [--spinner-duration:1]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              xmlns="http://www.w3.org/2000/svg"
              fillRule="evenodd"
              clipRule="evenodd"
              strokeLinejoin="round"
              strokeMiterlimit="2"
              className="h-7 w-7"
            >
              <path
                className="animate-[addToSpinner_calc(var(--spinner-duration,1)*1s)_linear_infinite] origin-[center_center]"
                d="M8.003 14.992h-.006c-3.836 0-6.992-3.156-6.992-6.992s3.156-6.992 6.992-6.992c1.658 0 3.261.589 4.524 1.66.17.112.273.302.273.505 0 .33-.273.603-.603.603a.606.606 0 0 1-.447-.199 5.797 5.797 0 0 0-3.741-1.37c-3.18 0-5.795 2.617-5.795 5.796 0 3.18 2.616 5.795 5.795 5.795s5.795-2.616 5.795-5.795V8c.037-.3.295-.53.598-.53.304 0 .562.228.599.53 0 3.836-3.156 6.992-6.992 6.992"
                fillRule="nonzero"
              ></path>
            </svg>
          </div>
        </div>
      );
    }

    if (activeLabelFeedback) {
      return (
        <div
          className={`items-center text-(--systemSecondary) inline-flex [font:var(--body-emphasized)] h-full justify-center me-2.5 transition-opacity duration-1000 ${
            activeLabelFeedback === "fading" ? "opacity-0" : "opacity-100"
          }`}
          role="status"
        >
          <span>Added to library</span>
        </div>
      );
    }

    return (
      <button
        className="items-center text-(--keyColor) cursor-pointer inline-flex justify-center [transition:var(--global-transition)] bg-(--systemQuinary) rounded-2xl gap-x-0.75 [font:var(--body-emphasized)] h-full min-w-16 px-3 me-2.5"
        title="Add to Library"
        type="button"
        aria-label={`Add ${title} to Library`}
        onClick={() => void addToLibrary()}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          xmlns="http://www.w3.org/2000/svg"
          className="fill-(--keyColor)"
          aria-hidden="true"
        >
          <path d="M.784 5.784h3.432v3.432c0 .43.354.784.784.784.43 0 .784-.354.784-.784V5.784h3.432a.784.784 0 1 0 0-1.568H5.784V.784A.788.788 0 0 0 5 0a.788.788 0 0 0-.784.784v3.432H.784a.784.784 0 1 0 0 1.568z" />
        </svg>
        <span>Add</span>
      </button>
    );
  }

  return (
    <div className="items-stretch flex shrink-0 h-7">
      {resolvedStatus === "loading" && (
        <div className="[--spinnerFillColor:var(--addToLibraryFillOverride)] items-center flex h-(--add-to-library-button-width) justify-center w-(--add-to-library-button-width)">
          <div className="items-center inline-flex h-7 justify-center w-7 fill-(--spinnerFillColor,var(--keyColor)) me-2.5 [--spinner-duration:1]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              xmlns="http://www.w3.org/2000/svg"
              fillRule="evenodd"
              clipRule="evenodd"
              strokeLinejoin="round"
              strokeMiterlimit="2"
              className="h-7 w-7"
            >
              <path
                className="animate-[addToSpinner_calc(var(--spinner-duration,1)*1s)_linear_infinite] origin-[center_center]"
                d="M8.003 14.992h-.006c-3.836 0-6.992-3.156-6.992-6.992s3.156-6.992 6.992-6.992c1.658 0 3.261.589 4.524 1.66.17.112.273.302.273.505 0 .33-.273.603-.603.603a.606.606 0 0 1-.447-.199 5.797 5.797 0 0 0-3.741-1.37c-3.18 0-5.795 2.617-5.795 5.796 0 3.18 2.616 5.795 5.795 5.795s5.795-2.616 5.795-5.795V8c.037-.3.295-.53.598-.53.304 0 .562.228.599.53 0 3.836-3.156 6.992-6.992 6.992"
                fillRule="nonzero"
              ></path>
            </svg>
          </div>
        </div>
      )}

      {resolvedStatus !== "loading" && (
        <button
          className={`items-center text-(--keyColor) inline-flex justify-center transition-(--global-transition) h-(--add-to-library-button-width,25px) leading-0 w-(--add-to-library-button-width,25px) me-(--addToLibraryMarginEnd,4px) bg-(--add-to-library-bg-color) [border:.75px_solid_var(--add-to-library-border-color)] rounded-full ${readOnlySaved ? "cursor-default" : "cursor-pointer"} ${resolvedStatus === "saved" ? "[--add-to-library-icon-width:26px]" : ""}`}
          title={
            readOnlySaved
              ? "Added to Library"
              : resolvedStatus === "saved"
                ? "Delete from Library"
                : "Add to Library"
          }
          type="button"
          aria-label={
            resolvedStatus === "saved" ? "Added to library" : "Add to library"
          }
          disabled={confirming}
          onClick={
            readOnlySaved
              ? undefined
              : () =>
                  resolvedStatus === "saved"
                    ? openDeleteConfirmation()
                    : void addToLibrary()
          }
        >
          {resolvedStatus === "idle" && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              xmlns="http://www.w3.org/2000/svg"
              fillRule="evenodd"
              clipRule="evenodd"
              strokeLinejoin="round"
              strokeMiterlimit="2"
              className="pointer-events-none h-(--add-to-library-icon-width,12px) w-(--add-to-library-icon-width,12px) fill-(--addToLibraryFillOverride,var(--keyColor))"
              aria-hidden="true"
            >
              <path
                d="M.784 5.784h3.432v3.432c0 .43.354.784.784.784.43 0 .784-.354.784-.784V5.784h3.432a.784.784 0 1 0 0-1.568H5.784V.784A.788.788 0 0 0 5 0a.788.788 0 0 0-.784.784v3.432H.784a.784.784 0 1 0 0 1.568z"
                fillRule="nonzero"
              />
            </svg>
          )}

          {resolvedStatus === "saved" && (
            <svg
              viewBox="0 0 16 16"
              className="h-(--add-to-library-icon-width,12px) w-(--add-to-library-icon-width,12px) fill-(--addToLibraryFillOverride,var(--keyColor))"
            >
              <path d="M6.9 12.9c.3 0 .5-.1.7-.4l5.3-8.4c.1-.1.1-.3.1-.4 0-.4-.2-.6-.6-.6-.3 0-.4.1-.6.3l-5 8-2.6-3.5c-.2-.2-.3-.3-.6-.3s-.6.2-.6.6c0 .2.1.3.2.5l3 3.9c.2.2.4.3.7.3z"></path>
            </svg>
          )}
        </button>
      )}

      <LibraryDeleteConfirmationDialog
        open={confirming}
        resourceType={resourceType}
        onConfirm={() => void removeFromLibrary()}
        onCancel={() => void cancelDeleteConfirmation()}
      />
    </div>
  );
}
