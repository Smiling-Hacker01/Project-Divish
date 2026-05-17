import multer from 'multer';

// Diary supports images + short videos. 40 MB cap matches the chat upload to keep one
// consistent ceiling across the app; multer's size limit is the hard backstop for the
// 60s mobile-side video duration cap.
const MAX_BYTES = 40 * 1024 * 1024;

const ALLOWED_MIMES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

export const diaryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported diary media type: ${file.mimetype}`));
  },
});
