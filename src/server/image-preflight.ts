import { PNG } from 'pngjs';

export type ImagePreflight = {
  method: 'alpha' | 'border-color-heuristic';
  alphaCoverage: number;
  estimatedContentBox: [number, number, number, number];
  edgeTouch: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  borderUniformity: number;
  warnings: string[];
  visiblePixelCount?: number;
};

function clamp(value: number) { return Math.max(0, Math.min(1, value)); }

/**
 * Detects framing and background risks before an agent starts tracing. This is
 * deliberately a geometry/background heuristic, not semantic segmentation.
 */
export function inspectImagePreflight(image: PNG): ImagePreflight {
  const total = image.width * image.height;
  let alphaPixels = 0;
  let visiblePixelCount = 0;
  let borderCount = 0;
  let borderR = 0, borderG = 0, borderB = 0;
  const isBorder = (x: number, y: number) => x < 2 || y < 2 || x >= image.width - 2 || y >= image.height - 2;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const index = (y * image.width + x) * 4;
    if (image.data[index + 3] < 250) alphaPixels++;
    if (image.data[index + 3] > 0) visiblePixelCount++;
    if (isBorder(x, y)) { borderR += image.data[index]; borderG += image.data[index + 1]; borderB += image.data[index + 2]; borderCount++; }
  }
  const transparent = alphaPixels > 0;
  const background = { r: borderR / borderCount, g: borderG / borderCount, b: borderB / borderCount };
  let borderDeviation = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (isBorder(x, y)) {
    const index = (y * image.width + x) * 4;
    borderDeviation += Math.hypot(image.data[index] - background.r, image.data[index + 1] - background.g, image.data[index + 2] - background.b) / 441.673;
  }
  const borderUniformity = clamp(1 - borderDeviation / borderCount * 4);
  const threshold = transparent ? 8 : 24;
  let x0 = image.width, y0 = image.height, x1 = 0, y1 = 0, content = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const index = (y * image.width + x) * 4;
    const alpha = image.data[index + 3];
    const colorDistance = Math.hypot(image.data[index] - background.r, image.data[index + 1] - background.g, image.data[index + 2] - background.b);
    if (alpha >= 20 && (transparent ? alpha >= threshold : colorDistance >= threshold)) {
      content++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
    }
  }
  if (!content) { x0 = 0; y0 = 0; x1 = image.width; y1 = image.height; }
  const marginX = Math.max(1, Math.round(image.width * 0.02));
  const marginY = Math.max(1, Math.round(image.height * 0.02));
  const edgeTouch = { top: content > 0 && y0 <= marginY, right: content > 0 && x1 >= image.width - marginX, bottom: content > 0 && y1 >= image.height - marginY, left: content > 0 && x0 <= marginX };
  const warnings: string[] = [];
  if (!visiblePixelCount) warnings.push('No visible pixels remain. Inspect the original image and disable background removal before uploading again; this source cannot produce an avatar.');
  if (!transparent) warnings.push('The source is fully opaque: its background may rotate and deform with the avatar. Separate the character from the background locally before rigging, or explicitly retain this limitation. Uniform white is not transparency; inspect tilt-left and tilt-right against a contrasting background.');
  if (Object.values(edgeTouch).some(Boolean)) warnings.push('Estimated subject touches the image edge; head, shoulders or accessories may be cropped during deformation.');
  if (!transparent && borderUniformity < 0.82) warnings.push('Border background is not uniform; inspect gradients, shadows or scenery before layer extraction.');
  if (transparent && alphaPixels / total < 0.01) warnings.push('Transparency coverage is very small; confirm that the alpha channel represents the intended background.');
  return { method: transparent ? 'alpha' : 'border-color-heuristic', visiblePixelCount, alphaCoverage: Number((alphaPixels / total).toFixed(4)), estimatedContentBox: [x0, y0, x1, y1], edgeTouch, borderUniformity: Number(borderUniformity.toFixed(4)), warnings };
}
