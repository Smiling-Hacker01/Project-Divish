import multer from 'multer';

// Vault is the most permissive uploader in the app: it stores private memories that
// users want to keep at original quality. Images at 40 MB, videos up to 200 MB. The
// per-file ceiling protects the server from a single huge upload stalling Node's
// request pipeline; per-batch behavior is controlled client-side (3 concurrent).
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

const ALLOWED_IMAGE = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const ALLOWED_VIDEO = new Set<string>([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

export const vaultUpload = multer({
  storage: multer.memoryStorage(),
  // Use the larger cap; the per-type check inside the controller enforces the tighter
  // image-only limit so we get a clean 400 instead of multer's generic LIMIT_FILE_SIZE.
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE.has(file.mimetype) || ALLOWED_VIDEO.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported vault media type: ${file.mimetype}`));
  },
});

export const VAULT_LIMITS = { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, ALLOWED_IMAGE, ALLOWED_VIDEO };
