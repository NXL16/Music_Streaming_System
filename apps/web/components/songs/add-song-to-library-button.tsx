"use client";

import { type MouseEvent, useEffect, useId, useState } from "react";
import {
  addLibraryResource,
  getLibraryResources,
  isLibraryResource,
  subscribeLibraryResourcesChanged,
} from "@/lib/library/library-resources.api";
import {
  notifyMenuError,
  notifyMenuSuccess,
} from "@/lib/notifications/menu-toast";

type AddSongToLibraryButtonProps = {
  songId: string;
  title: string;
  artist?: string;
  artworkUrl?: string;
  /** Collapses the action until its parent row (`group`) is hovered. */
  showOnParentHover?: boolean;
};

/** A row action that is visible only while its song is outside Library. */
export function AddSongToLibraryButton({
  songId,
  title,
  artist = "",
  artworkUrl = "",
  showOnParentHover = false,
}: AddSongToLibraryButtonProps) {
  const sourceId = useId();
  const [status, setStatus] = useState<
    "checking" | "idle" | "adding" | "saved"
  >("checking");
  const loadingDelay = () =>
    new Promise<void>((resolve) => window.setTimeout(resolve, 300));

  useEffect(() => {
    let active = true;

    void getLibraryResources()
      .then(() => {
        if (active)
          setStatus(isLibraryResource("songs", songId) ? "saved" : "idle");
      })
      .catch(() => {
        if (active) setStatus("idle");
      });

    return () => {
      active = false;
    };
  }, [songId]);

  useEffect(
    () =>
      subscribeLibraryResourcesChanged((change) => {
        if (
          change &&
          (change.resourceType !== "songs" ||
            (change.resourceId !== songId && change.operation !== "sync"))
        ) {
          return;
        }

        void getLibraryResources().then(() => {
          setStatus((currentStatus) =>
            currentStatus === "adding"
              ? currentStatus
              : isLibraryResource("songs", songId)
                ? "saved"
                : "idle",
          );
        });
      }),
    [songId],
  );

  async function addSong(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (status !== "idle") return;

    setStatus("adding");
    try {
      await Promise.all([
        addLibraryResource(
          {
            resourceType: "songs",
            resourceId: songId,
            title,
            subtitle: artist,
            artworkUrl,
          },
          sourceId,
        ),
        loadingDelay(),
      ]);
      setStatus("saved");
      notifyMenuSuccess("Added to Library");
    } catch {
      setStatus("idle");
      notifyMenuError("Couldn't add to Library");
    }
  }

  if (status === "checking" || status === "saved") return null;

  return (
    <button
      type="button"
      onClick={addSong}
      disabled={status === "adding"}
      aria-label={`Add ${title} to Library`}
      title="Add to Library"
      className={`items-center text-(--keyColor) cursor-pointer inline-flex justify-center [transition:var(--global-transition)] h-(--add-to-library-button-width,25px) leading-0 me-(--addToLibraryMarginEnd,4px) disabled:cursor-default ${
        showOnParentHover
          ? "w-0 overflow-hidden opacity-0 group-hover:w-(--add-to-library-button-width,25px) group-hover:opacity-100"
          : "w-(--add-to-library-button-width,25px)"
      }`}
    >
      {status === "adding" ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          xmlns="http://www.w3.org/2000/svg"
          fillRule="evenodd"
          clipRule="evenodd"
          strokeLinejoin="round"
          strokeMiterlimit="2"
          className="h-(--add-to-library-icon-width,18px) w-(--add-to-library-icon-width,18px) fill-(--addToLibraryFillOverride,var(--keyColor))"
        >
          <path
            className="animate-[addToSpinner_calc(var(--spinner-duration,1)*1s)_linear_infinite] origin-[center_center]"
            d="M8.003 14.992h-.006c-3.836 0-6.992-3.156-6.992-6.992s3.156-6.992 6.992-6.992c1.658 0 3.261.589 4.524 1.66.17.112.273.302.273.505 0 .33-.273.603-.603.603a.606.606 0 0 1-.447-.199 5.797 5.797 0 0 0-3.741-1.37c-3.18 0-5.795 2.617-5.795 5.796 0 3.18 2.616 5.795 5.795 5.795s5.795-2.616 5.795-5.795V8c.037-.3.295-.53.598-.53.304 0 .562.228.599.53 0 3.836-3.156 6.992-6.992 6.992"
            fillRule="nonzero"
          ></path>
        </svg>
      ) : (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          xmlns="http://www.w3.org/2000/svg"
          fillRule="evenodd"
          clipRule="evenodd"
          strokeLinejoin="round"
          strokeMiterlimit="2"
          className="h-(--add-to-library-icon-width,12px) w-(--add-to-library-icon-width,12px) fill-(--addToLibraryFillOverride,var(--keyColor))"
          aria-hidden="true"
        >
          <path
            d="M.784 5.784h3.432v3.432c0 .43.354.784.784.784.43 0 .784-.354.784-.784V5.784h3.432a.784.784 0 1 0 0-1.568H5.784V.784A.788.788 0 0 0 5 0a.788.788 0 0 0-.784.784v3.432H.784a.784.784 0 1 0 0 1.568z"
            fillRule="nonzero"
          />
        </svg>
      )}
    </button>
  );
}
