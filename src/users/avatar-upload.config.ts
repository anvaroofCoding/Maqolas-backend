import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';

const AVATAR_DIR = join(process.cwd(), 'uploads', 'avatars');

export function ensureAvatarDir() {
  if (!existsSync(AVATAR_DIR)) {
    mkdirSync(AVATAR_DIR, { recursive: true });
  }
  return AVATAR_DIR;
}

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const avatarUploadOptions = {
  limits: { fileSize: 5 * 1024 * 1024 },
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
      cb(null, ensureAvatarDir());
    },
    filename: (req, file, cb) => {
      const user = (req as Express.Request & { user?: { id?: string; _id?: { toString(): string } } })
        .user;
      const id = user?.id ?? user?._id?.toString() ?? 'unknown';
      const ext = extname(file.originalname).toLowerCase() || '.jpg';
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)
        ? ext === '.jpeg'
          ? '.jpg'
          : ext
        : '.jpg';
      cb(null, `${id}${safeExt}`);
    },
  }),
};
