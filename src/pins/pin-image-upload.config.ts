import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';

const PIN_IMAGE_DIR = join(process.cwd(), 'uploads', 'pins');

export function ensurePinImageDir() {
  if (!existsSync(PIN_IMAGE_DIR)) {
    mkdirSync(PIN_IMAGE_DIR, { recursive: true });
  }
  return PIN_IMAGE_DIR;
}

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const pinImageUploadOptions = {
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(
        new BadRequestException(
          'Faqat JPEG, PNG, WebP yoki GIF rasmlar qabul qilinadi',
        ),
        false,
      );
    }
    cb(null, true);
  },
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, ensurePinImageDir());
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase() || '.jpg';
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)
        ? ext === '.jpeg'
          ? '.jpg'
          : ext
        : '.jpg';
      cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${safeExt}`);
    },
  }),
};
