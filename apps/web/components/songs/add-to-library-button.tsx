"use client";
import { useEffect, useRef, useState } from "react";
import { http } from "@/lib/api/http";
export function AddToLibraryButton({
  resourceType,
  resourceId,
  title,
  subtitle = "",
  artworkUrl = "",
}: {
  resourceType: "albums" | "playlists";
  resourceId: string;
  title: string;
  subtitle?: string;
  artworkUrl?: string;
}) {
  const [status, setStatus] = useState<
    "checking" | "idle" | "loading" | "saved"
  >("checking");
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const loadingDelay = () =>
    new Promise<void>((resolve) => window.setTimeout(resolve, 300));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (confirming && !dialog.open) dialog.showModal();
    if (!confirming && dialog.open) dialog.close();
  }, [confirming]);

  useEffect(() => {
    let active = true;
    void http
      .get<{ resources: { resourceType: string; resourceId: string }[] }>(
        "/songs/library/resources",
      )
      .then(({ data }) => {
        if (active) {
          setStatus(
            data.resources.some(
              (resource) =>
                resource.resourceType === resourceType &&
                resource.resourceId === resourceId,
            )
              ? "saved"
              : "idle",
          );
        }
      })
      .catch(() => {
        if (active) setStatus("idle");
      });
    return () => {
      active = false;
    };
  }, [resourceId, resourceType]);

  async function addToLibrary() {
    if (status !== "idle") return;
    setStatus("loading");
    try {
      await Promise.all([
        http.post("/songs/library/resources", {
          resourceType,
          resourceId,
          title,
          subtitle,
          artworkUrl,
        }),
        loadingDelay(),
      ]);
      setStatus("saved");
    } catch {
      setStatus("idle");
    }
  }
  async function removeFromLibrary() {
    setConfirming(false);
    try {
      await Promise.all([
        http.delete(`/songs/library/resources/${resourceType}/${resourceId}`),
        loadingDelay(),
      ]);
      setStatus("idle");
    } catch {
      setStatus("saved");
    }
  }

  function openDeleteConfirmation() {
    if (status !== "saved") return;
    setStatus("loading");
    setConfirming(true);
  }

  async function cancelDeleteConfirmation() {
    setConfirming(false);
    await loadingDelay();
    setStatus("saved");
  }

  if (status === "checking") return null;

  return (
    <div className="items-stretch flex shrink-0 h-7">
      {status === "loading" && (
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

      {status !== "loading" && (
        <button
          className={`items-center text-(--keyColor) cursor-pointer inline-flex justify-center transition-(--global-transition) h-(--add-to-library-button-width,25px) leading-0 w-(--add-to-library-button-width,25px) me-(--addToLibraryMarginEnd,4px) bg-(--add-to-library-bg-color) [border:.75px_solid_var(--add-to-library-border-color)] rounded-full ${status === "saved" ? "[--add-to-library-icon-width:26px]" : ""}`}
          title={status === "saved" ? "Delete from Library" : "Add to Library"}
          type="button"
          aria-label={
            status === "saved" ? "Added to library" : "Add to library"
          }
          disabled={confirming}
          onClick={() =>
            status === "saved" ? openDeleteConfirmation() : void addToLibrary()
          }
        >
          {status === "idle" && (
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

          {status === "saved" && (
            <svg
              viewBox="0 0 16 16"
              className="h-(--add-to-library-icon-width,12px) w-(--add-to-library-icon-width,12px) fill-(--addToLibraryFillOverride,var(--keyColor))"
            >
              <path d="M6.9 12.9c.3 0 .5-.1.7-.4l5.3-8.4c.1-.1.1-.3.1-.4 0-.4-.2-.6-.6-.6-.3 0-.4.1-.6.3l-5 8-2.6-3.5c-.2-.2-.3-.3-.6-.3s-.6.2-.6.6c0 .2.1.3.2.5l3 3.9c.2.2.4.3.7.3z"></path>
            </svg>
          )}
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-80 rounded-xl border border-white/20 bg-[#242424] p-4 text-center text-white shadow-2xl backdrop:bg-black/40"
        onCancel={(event) => {
          event.preventDefault();
          void cancelDeleteConfirmation();
        }}
      >
        <h2 className="text-base font-bold">Delete from Library</h2>
        <p className="mt-3 text-sm text-neutral-200">
          Are you sure you want to delete this{" "}
          {resourceType === "albums" ? "album" : "playlist"} from your
          library?
        </p>
        <button
          className="mt-4 w-full rounded-lg bg-[#e60018] py-2.5 font-bold"
          onClick={() => void removeFromLibrary()}
          type="button"
        >
          OK
        </button>
        <button
          className="mt-2 w-full rounded-lg bg-neutral-400 py-2.5 font-bold"
          onClick={() => void cancelDeleteConfirmation()}
          type="button"
        >
          Cancel
        </button>
      </dialog>
    </div>
  );
}
