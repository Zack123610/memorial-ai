import multer from 'multer';
import { config } from '../config/env.js';

/**
 * Accepts one `image` and one `audio` file, kept in memory so they can be
 * forwarded straight to the TTS and video services. Rejects wrong content
 * types; enforces the configured per-file size limit.
 */
export const uploadJobFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'image' && file.mimetype.startsWith('image/')) return cb(null, true);
    if (file.fieldname === 'audio' && file.mimetype.startsWith('audio/')) return cb(null, true);
    cb(new Error(`Unsupported file for field "${file.fieldname}" (${file.mimetype})`));
  },
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
]);
