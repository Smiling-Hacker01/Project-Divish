/**
 * Cloudinary URL transformers — derived URLs computed client-side so we don't store
 * multiple variants of the same asset. Cloudinary serves the requested transformation
 * lazily and caches it on their CDN.
 *
 * Pattern: `.../upload/<transform>/<rest>` — we insert the transformation segment
 * between `/upload/` and the version/path.
 */

const CLOUDINARY_HOST = /^https?:\/\/res\.cloudinary\.com\//i;

const insertTransform = (url: string, transform: string): string => {
  if (!CLOUDINARY_HOST.test(url)) return url;
  // Idempotent: if a transform segment already exists, replace it. Detect via the
  // `/upload/<token>/` pattern where token contains an `_` or `,` (Cloudinary syntax).
  return url.replace(/\/upload\/(?:[a-z0-9_,.:%-]+\/)?/i, `/upload/${transform}/`);
};

/**
 * Feed thumbnail — auto-format (HEIC/WebP fallback to JPEG), auto-quality, capped width.
 * Pass `width` as a CSS-pixel-equivalent value; we multiply for hi-DPI displays.
 */
export const thumbUrl = (url: string | null | undefined, width = 640): string | null => {
  if (!url) return null;
  // 2× for retina-ish devices. Cloudinary won't exceed the original asset's dimensions.
  const px = Math.round(width * 2);
  return insertTransform(url, `f_auto,q_auto,w_${px},c_limit`);
};

/**
 * Full-screen detail image — higher cap, still auto-format/quality.
 */
export const fullUrl = (url: string | null | undefined, width = 1080): string | null => {
  if (!url) return null;
  return insertTransform(url, `f_auto,q_auto,w_${Math.round(width * 2)},c_limit`);
};

/**
 * Video poster frame. Cloudinary computes the first-frame JPEG at the requested size.
 * Falls back to the input URL if it doesn't look Cloudinary-hosted.
 */
export const videoPosterUrl = (url: string | null | undefined, width = 720): string | null => {
  if (!url) return null;
  // Replace the resource type if needed: video/upload/... → image/upload/... with so_0,f_jpg
  const swapped = url.replace('/video/upload/', '/image/upload/');
  return insertTransform(swapped.replace(/\.(mp4|mov|webm)(\?|$)/i, '.jpg$2'), `so_0,f_auto,q_auto,w_${Math.round(width * 2)},c_limit`);
};
