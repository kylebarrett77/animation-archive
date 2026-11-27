/**
 * Render any artwork into the archive's standard poster card: a 2:3 WebP.
 *
 * - Images within FILL_TOLERANCE of 2:3 (real posters) fill the card.
 * - Anything else (wide title cards, logos, square art) is fitted whole
 *   inside the card over a blurred, darkened copy of itself, so nothing
 *   is cropped and there are no flat letterbox bars.
 *
 * Output is deterministic for a given input and sharp version, so
 * re-rendering an unchanged image produces identical bytes (no git churn).
 */
import sharp from 'sharp';

export const CARD_W = 480;   // serves ~240 px cards at 2x density
export const CARD_H = 720;
const POSTER_AR = CARD_W / CARD_H;
const FILL_TOLERANCE = 0.05;  // within 5% of 2:3 -> fill (crop <= ~5%)

const hex = n => Math.round(n).toString(16).padStart(2, '0');

/**
 * @param {Buffer} input  original image bytes (jpeg/png/webp/gif/avif/svg/tiff)
 * @returns {Promise<{buffer: Buffer, srcW: number, srcH: number, ar: number, color: string}>}
 */
export async function renderCard(input) {
  // Normalise once: first frame only, honour EXIF orientation, rasterise
  // vector art at a usable resolution.
  const { data: base, info } = await sharp(input, { animated: false, density: 200, failOn: 'error' })
    .rotate()
    .toBuffer({ resolveWithObject: true });
  const srcW = info.width;
  const srcH = info.height;
  const ar = srcW / srcH;

  const { dominant } = await sharp(base).stats();
  const color = `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`;

  let card;
  if (Math.abs(ar - POSTER_AR) / POSTER_AR <= FILL_TOLERANCE) {
    card = sharp(base).resize(CARD_W, CARD_H, { fit: 'cover', position: 'centre' });
  } else {
    const backdrop = await sharp(base)
      .resize(CARD_W, CARD_H, { fit: 'cover' })
      .blur(28)
      .modulate({ brightness: 0.55, saturation: 1.15 })
      .toBuffer();
    const foreground = await sharp(base)
      .resize(CARD_W, CARD_H, { fit: 'inside' })
      .toBuffer();
    card = sharp(backdrop).composite([{ input: foreground, gravity: 'centre' }]);
  }

  const buffer = await card.webp({ quality: 80, effort: 5, smartSubsample: true }).toBuffer();
  return { buffer, srcW, srcH, ar: Math.round(ar * 1000) / 1000, color };
}
