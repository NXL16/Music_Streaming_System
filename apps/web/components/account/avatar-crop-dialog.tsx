"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { Spinner } from "@/components/loading/spinner";
import {
  AVATAR_MAX_ZOOM,
  AVATAR_MIN_ZOOM,
  clampCropOffset,
  getCoverScale,
  normalizeRotation,
  renderCroppedAvatarFile,
  type CropOffset,
  type ImageDimensions,
} from "@/lib/account/avatar-crop";
import styles from "./avatar-crop-dialog.module.css";

type AvatarCropDialogProps = {
  file: File | null;
  submitting: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (croppedFile: File) => Promise<void>;
};

const DEFAULT_CROP_DIAMETER = 268;
const GUIDE_HIDE_DELAY_MS = 3000;

export function AvatarCropDialog({
  file,
  submitting,
  error,
  onCancel,
  onSubmit,
}: AvatarCropDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: CropOffset;
  } | null>(null);
  const guideTimerRef = useRef<number | null>(null);
  const titleId = useId();

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<ImageDimensions | null>(null);
  const [cropDiameter, setCropDiameter] = useState(DEFAULT_CROP_DIAMETER);
  const [zoom, setZoom] = useState(AVATAR_MIN_ZOOM);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [offset, setOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const [showGuides, setShowGuides] = useState(true);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (file && !dialog.open) dialog.showModal();
    if (!file && dialog.open) dialog.close();
  }, [file]);

  useEffect(() => {
    if (!file) return;

    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled && typeof reader.result === "string") {
        setImageUrl(reader.result);
      }
    };
    reader.onerror = () => {
      if (!cancelled) {
        setLocalError("Could not read the selected image.");
      }
    };
    reader.readAsDataURL(file);

    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [file]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !file) return;

    const updateDiameter = () => {
      const next = Math.max(
        180,
        Math.min(
          DEFAULT_CROP_DIAMETER,
          Math.floor(Math.min(stage.clientWidth, stage.clientHeight) * 0.8),
        ),
      );
      setCropDiameter(next);
    };

    updateDiameter();
    const observer = new ResizeObserver(updateDiameter);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [file]);

  const unrotatedImageScale = naturalSize
    ? getCoverScale(naturalSize, cropDiameter, rotation) * zoom
    : 1;

  const applyTransform = useCallback(
    (
      nextZoom: number,
      nextRotation: 0 | 90 | 180 | 270,
      nextOffset: CropOffset,
    ) => {
      setZoom(nextZoom);
      setRotation(nextRotation);
      if (!naturalSize) {
        setOffset(nextOffset);
        return;
      }
      setOffset(
        clampCropOffset(
          nextOffset,
          naturalSize,
          cropDiameter,
          nextZoom,
          nextRotation,
        ),
      );
    },
    [cropDiameter, naturalSize],
  );

  const revealGuidesTemporarily = useCallback(() => {
    setShowGuides(true);
    if (guideTimerRef.current !== null) {
      window.clearTimeout(guideTimerRef.current);
    }
    guideTimerRef.current = window.setTimeout(() => {
      setShowGuides(false);
      guideTimerRef.current = null;
    }, GUIDE_HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !file || !naturalSize || submitting) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const nextZoom = Math.min(
        AVATAR_MAX_ZOOM,
        Math.max(AVATAR_MIN_ZOOM, zoom - event.deltaY * 0.0015),
      );
      applyTransform(nextZoom, rotation, offset);
      revealGuidesTemporarily();
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [
    applyTransform,
    file,
    naturalSize,
    offset,
    revealGuidesTemporarily,
    rotation,
    submitting,
    zoom,
  ]);

  useEffect(() => {
    return () => {
      if (guideTimerRef.current !== null) {
        window.clearTimeout(guideTimerRef.current);
      }
    };
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!naturalSize || submitting) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: offset,
    };
    revealGuidesTemporarily();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !naturalSize) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    applyTransform(zoom, rotation, {
      x: drag.origin.x + dx,
      y: drag.origin.y + dy,
    });
    revealGuidesTemporarily();
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  async function handleConfirm() {
    if (!imageRef.current || !naturalSize || submitting) return;
    setLocalError("");
    try {
      const cropped = await renderCroppedAvatarFile({
        image: imageRef.current,
        cropDiameter,
        zoom,
        rotation,
        offset,
        fileName: file?.name,
      });
      await onSubmit(cropped);
    } catch (cropError) {
      setLocalError(
        cropError instanceof Error
          ? cropError.message
          : "Could not crop your profile picture.",
      );
    }
  }

  const displayError = localError || error;

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting) onCancel();
      }}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          Profile Image
        </h2>
        <p className={styles.subtitle}>
          Scale, rotate, or drag your image into position. When you&apos;re
          done, click Submit.
        </p>
      </div>

      <div
        ref={stageRef}
        className={styles.stage}
        style={{ "--crop-diameter": `${cropDiameter}px` } as CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {imageUrl && naturalSize && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            className={styles.backdropBlur}
          />
        )}

        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Crop preview"
            draggable={false}
            className={styles.imageLayer}
            style={{
              width: naturalSize ? `${naturalSize.width}px` : "auto",
              height: naturalSize ? `${naturalSize.height}px` : "auto",
              opacity: naturalSize ? 1 : 0,
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${unrotatedImageScale})`,
            }}
            onLoad={(event) => {
              const img = event.currentTarget;
              setNaturalSize({
                width: img.naturalWidth,
                height: img.naturalHeight,
              });
            }}
            onError={() => {
              setLocalError("Could not load the selected image.");
            }}
          />
        )}

        <div className={styles.vignette} aria-hidden="true" />

        <div
          className={`${styles.edgeBlendOverlay} ${showGuides ? "" : styles.edgeBlendOverlayVisible}`}
          aria-hidden="true"
        >
          {imageUrl && naturalSize && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className={styles.backdropBlur}
            />
          )}
          <div className={styles.vignette} />
        </div>

        <div className={styles.cropMask} aria-hidden="true">
          <div
            className={`${styles.guides} ${showGuides ? "" : styles.guidesHidden}`}
          >
            <div className={styles.guideBand} />
            <span className={styles.guideLabelTop}>
              Keep eyebrows below this line
            </span>
            <span className={styles.guideLabelBottom}>
              Keep lips above this line
            </span>
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        <input
          type="range"
          min={AVATAR_MIN_ZOOM}
          max={AVATAR_MAX_ZOOM}
          step={0.01}
          value={zoom}
          disabled={!naturalSize || submitting}
          aria-label="Zoom image"
          className={styles.slider}
          onChange={(event) => {
            applyTransform(Number(event.target.value), rotation, offset);
            revealGuidesTemporarily();
          }}
        />

        <button
          type="button"
          className={styles.rotateButton}
          disabled={!naturalSize || submitting}
          aria-label="Rotate 90 degrees"
          title="Rotate 90°"
          onClick={() => {
            applyTransform(zoom, normalizeRotation(rotation + 90), offset);
            revealGuidesTemporarily();
          }}
        >
          <svg
            width="20"
            height="18"
            viewBox="0 0 22 18"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="2"
              y="6"
              width="12"
              height="10"
              rx="2.5"
              fill="currentColor"
              opacity="0.85"
            />
            <path
              d="M15.5 2.5C17.8 2.5 19.5 4.2 19.5 6.5V8.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
            <path
              d="M17.2 7L19.5 9.2L21.5 6.8"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {displayError && (
        <p className={styles.error} role="alert">
          {displayError}
        </p>
      )}

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.cancelButton}
          disabled={submitting}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.submitButton}
          disabled={!naturalSize || submitting}
          onClick={() => void handleConfirm()}
        >
          {submitting && <Spinner size={14} />}
          <span>{submitting ? "Submitting..." : "Submit"}</span>
        </button>
      </div>
    </dialog>
  );
}
