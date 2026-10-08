/**
 * Shrink, grayscale, and lightly crop a driver document photo.
 * Decode uses createImageBitmap (off the main thread). The pixel pass yields
 * so a large photo cannot freeze the next camera tap.
 */

const MAX_EDGE = 1600;
const YIELD_ROWS = 24;
const CROP_PAD = 8;
const PAPER_GRAY = 236;

export type PreparedPixels = {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
};

function grayAt(data: Uint8ClampedArray, index: number): number {
  return Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
}

async function yieldToUi(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Grayscale in place (on a copy) and crop to the non-paper bounds. */
export async function grayscaleAndCrop(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<PreparedPixels> {
  const data = new Uint8ClampedArray(rgba);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const i = (row + x) * 4;
      const gray = grayAt(data, i);
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
      if (gray < PAPER_GRAY) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (y > 0 && y % YIELD_ROWS === 0) await yieldToUi();
  }

  let sx = 0;
  let sy = 0;
  let sw = width;
  let sh = height;
  if (maxX > minX + 20 && maxY > minY + 20) {
    sx = Math.max(0, minX - CROP_PAD);
    sy = Math.max(0, minY - CROP_PAD);
    sw = Math.min(width - sx, maxX - minX + CROP_PAD * 2);
    sh = Math.min(height - sy, maxY - minY + CROP_PAD * 2);
  }
  if (sx === 0 && sy === 0 && sw === width && sh === height) {
    return { rgba: data, width, height };
  }

  const cropped = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y += 1) {
    const src = ((sy + y) * width + sx) * 4;
    cropped.set(data.subarray(src, src + sw * 4), y * sw * 4);
    if (y > 0 && y % YIELD_ROWS === 0) await yieldToUi();
  }
  return { rgba: cropped, width: sw, height: sh };
}

export type PreparedDriverPhoto = { kind: "jpeg"; bytes: Uint8Array } | { kind: "original" };

/**
 * JPEG bytes for the PDF, or the original file when this browser cannot decode it.
 * HEIC from the iOS photo library throws in createImageBitmap on many engines;
 * that must not surface as a silent failure.
 */
export async function prepareDriverPhoto(blob: Blob): Promise<PreparedDriverPhoto> {
  try {
    if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
      return { kind: "original" };
    }
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      bitmap.close?.();
      return { kind: "original" };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const source = ctx.getImageData(0, 0, width, height);
    const cropped = await grayscaleAndCrop(source.data, width, height);
    const pixelBuffer = new ArrayBuffer(cropped.rgba.byteLength);
    const pixels = new Uint8ClampedArray(pixelBuffer);
    pixels.set(cropped.rgba);
    canvas.width = cropped.width;
    canvas.height = cropped.height;
    ctx.putImageData(new ImageData(pixels, cropped.width, cropped.height), 0, 0);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!jpeg) return { kind: "original" };
    return { kind: "jpeg", bytes: new Uint8Array(await jpeg.arrayBuffer()) };
  } catch {
    return { kind: "original" };
  }
}
