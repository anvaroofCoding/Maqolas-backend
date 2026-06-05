import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';

const BANNER_DIR = join(process.cwd(), 'uploads', 'banners');

export function ensureBannerDir() {
  if (!existsSync(BANNER_DIR)) {
    mkdirSync(BANNER_DIR, { recursive: true });
  }
  return BANNER_DIR;
}

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const bannerUploadOptions = {
  limits: { fileSize: 8 * 1024 * 1024 },
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
      cb(null, ensureBannerDir());
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase() || '.jpg';
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)
        ? ext === '.jpeg'
          ? '.jpg'
          : ext
        : '.jpg';
      cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${safeExt}`);
    },
  }),
};
