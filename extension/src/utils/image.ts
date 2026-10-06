/**
 * Image processing for the service worker. No DOM here — everything runs on
 * `OffscreenCanvas`, which MV3 workers support.
 */

import type { Rect } from '../types/messages';

const THUMBNAIL_MAX_WIDTH = 360;
const PREVIEW_MAX_WIDTH = 900;

export interface ProcessedCapture {
  screenshot: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
}

async function bitmapFromDataUrl(dataUrl: string): Promise<ImageBitmap> {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

function drawScaled(source: ImageBitmap, maxWidth: number): OffscreenCanvas {
  const scale = Math.min(1, maxWidth / source.width);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/**
 * Crop the viewport screenshot to `rect` (CSS pixels) and derive a thumbnail
 * and a form preview.
 *
 * The capture is in device pixels; the rect is in CSS pixels. Instead of
 * trusting `devicePixelRatio` we derive the scale from the actual bitmap size
 * against the reported viewport — that stays correct under browser zoom and
 * on HiDPI displays alike.
 */
export async function processCapture(
  dataUrl: string,
  rect: Rect | null,
  viewport: { width: number; height: number },
): Promise<ProcessedCapture> {
  const full = await bitmapFromDataUrl(dataUrl);

  const scaleX = full.width / viewport.width;
  const scaleY = full.height / viewport.height;

  let sx = 0;
  let sy = 0;
  let sw = full.width;
  let sh = full.height;

  if (rect) {
    sx = Math.max(0, Math.round(rect.x * scaleX));
    sy = Math.max(0, Math.round(rect.y * scaleY));
    sw = Math.min(full.width - sx, Math.round(rect.width * scaleX));
    sh = Math.min(full.height - sy, Math.round(rect.height * scaleY));
  }

  if (sw < 2 || sh < 2) {
    throw new Error('The selected area is too small to capture.');
  }

  const cropped = new OffscreenCanvas(sw, sh);
  const ctx = cropped.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  full.close();

  const screenshot = await cropped.convertToBlob({ type: 'image/png' });
  const croppedBitmap = await createImageBitmap(screenshot);

  const thumbnail = await drawScaled(croppedBitmap, THUMBNAIL_MAX_WIDTH).convertToBlob({
    type: 'image/jpeg',
    quality: 0.85,
  });

  const previewCanvas = drawScaled(croppedBitmap, PREVIEW_MAX_WIDTH);
  const preview = await previewCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  croppedBitmap.close();

  return {
    screenshot,
    thumbnail,
    width: sw,
    height: sh,
    previewUrl: await blobToDataUrl(preview),
    previewWidth: previewCanvas.width,
    previewHeight: previewCanvas.height,
  };
}
