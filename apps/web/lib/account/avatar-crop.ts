export type CropOffset = {
  x: number;
  y: number;
};

export type ImageDimensions = {
  width: number;
  height: number;
};

export const AVATAR_CROP_OUTPUT_SIZE = 800;
export const AVATAR_MIN_ZOOM = 1;
export const AVATAR_MAX_ZOOM = 3;

/** Normalizes rotation to 0, 90, 180, or 270 degrees. */
export function normalizeRotation(degrees: number): 0 | 90 | 180 | 270 {
  const normalized = ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
  return normalized as 0 | 90 | 180 | 270;
}

/** Returns image dimensions after applying 90-degree step rotation. */
export function getRotatedDimensions(
  image: ImageDimensions,
  rotation: number,
): ImageDimensions {
  const angle = normalizeRotation(rotation);
  if (angle === 90 || angle === 270) {
    return { width: image.height, height: image.width };
  }
  return { width: image.width, height: image.height };
}

/**
 * Computes rendered dimensions at zoom = 1 so the rotated image covers
 * the square crop circle completely without leaving empty edges.
 */
export function getCoverDimensions(
  image: ImageDimensions,
  cropDiameter: number,
  rotation: number,
): ImageDimensions {
  const rotated = getRotatedDimensions(image, rotation);
  if (rotated.width <= 0 || rotated.height <= 0 || cropDiameter <= 0) {
    return { width: cropDiameter, height: cropDiameter };
  }
  const scale = Math.max(
    cropDiameter / rotated.width,
    cropDiameter / rotated.height,
  );
  return {
    width: rotated.width * scale,
    height: rotated.height * scale,
  };
}

/** Returns the uniform scale factor mapping unrotated image pixels to preview cover size. */
export function getCoverScale(
  image: ImageDimensions,
  cropDiameter: number,
  rotation: number,
): number {
  const angle = normalizeRotation(rotation);
  const cover = getCoverDimensions(image, cropDiameter, angle);
  if (image.width <= 0 || image.height <= 0) return 1;
  return angle === 90 || angle === 270
    ? cover.width / image.height
    : cover.width / image.width;
}

/** Clamps pan offset so the crop circle stays inside the scaled image bounds. */
export function clampCropOffset(
  offset: CropOffset,
  image: ImageDimensions,
  cropDiameter: number,
  zoom: number,
  rotation: number,
): CropOffset {
  const cover = getCoverDimensions(image, cropDiameter, rotation);
  const scaledWidth = cover.width * zoom;
  const scaledHeight = cover.height * zoom;
  const maxX = Math.max(0, (scaledWidth - cropDiameter) / 2);
  const maxY = Math.max(0, (scaledHeight - cropDiameter) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

/** Renders the cropped square avatar into a JPEG File ready for upload. */
export async function renderCroppedAvatarFile(options: {
  image: HTMLImageElement;
  cropDiameter: number;
  zoom: number;
  rotation: number;
  offset: CropOffset;
  fileName?: string;
}): Promise<File> {
  const {
    image,
    cropDiameter,
    zoom,
    rotation,
    offset,
    fileName = "avatar.jpg",
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_CROP_OUTPUT_SIZE;
  canvas.height = AVATAR_CROP_OUTPUT_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not initialize image crop canvas.");
  }

  const natural: ImageDimensions = {
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
  const angle = normalizeRotation(rotation);
  const clamped = clampCropOffset(offset, natural, cropDiameter, zoom, angle);
  const outputRatio = AVATAR_CROP_OUTPUT_SIZE / cropDiameter;

  // Map preview cover dimensions back to unrotated image coordinates on canvas.
  const coverScale = getCoverScale(natural, cropDiameter, angle);
  const drawScale = coverScale * zoom * outputRatio;

  context.fillStyle = "#000000";
  context.fillRect(0, 0, AVATAR_CROP_OUTPUT_SIZE, AVATAR_CROP_OUTPUT_SIZE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.save();
  context.translate(
    AVATAR_CROP_OUTPUT_SIZE / 2 + clamped.x * outputRatio,
    AVATAR_CROP_OUTPUT_SIZE / 2 + clamped.y * outputRatio,
  );
  context.rotate((angle * Math.PI) / 180);
  context.scale(drawScale, drawScale);
  context.drawImage(
    image,
    -natural.width / 2,
    -natural.height / 2,
    natural.width,
    natural.height,
  );
  context.restore();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) {
    throw new Error("Could not export cropped profile picture.");
  }

  const baseName = fileName.replace(/\.[^.]+$/, "") || "avatar";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}
