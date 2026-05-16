import multer from 'multer';

// Avatars are small. 5 MB is plenty after the client compresses to ~80% quality.
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIMES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported avatar format: ${file.mimetype}`));
  },
});
