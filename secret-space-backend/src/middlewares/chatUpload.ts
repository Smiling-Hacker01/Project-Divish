import multer from 'multer';

// Chat allows a broader set than vault/diary — images, video, audio, documents.
// Limit is intentionally generous (40 MB) for short videos but well under the
// express.json 50 MB ceiling on the base64 path.
const MAX_BYTES = 40 * 1024 * 1024;

const ALLOWED_PREFIXES = ['image/', 'video/', 'audio/'];
const ALLOWED_EXACT = new Set<string>([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/octet-stream',
  'text/plain',
  'text/csv',
]);

export const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok =
      ALLOWED_PREFIXES.some((p) => file.mimetype.startsWith(p)) ||
      ALLOWED_EXACT.has(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});
