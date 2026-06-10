import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Model } from 'mongoose';
import type { AppConfig } from '../config/configuration';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User, UserDocument } from './schemas/user.schema';
import { ensureAvatarDir } from './avatar-upload.config';

export interface GoogleProfilePayload {
  googleId: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

function usernameFromEmail(email: string) {
  const local = email.split('@')[0] ?? 'user';
  return local.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findById(id: string) {
    const user = await this.userModel.findById(id).exec();
    if (user && !user.username) {
      user.username = usernameFromEmail(user.email);
      await user.save();
    }
    return user;
  }

  async findByUsername(username: string) {
    const normalized = username.trim().toLowerCase();
    if (!normalized) return null;
    return this.userModel.findOne({ username: normalized }).exec();
  }

  toPublicProfile(user: UserDocument | null | undefined) {
    if (!user) return null;

    const json = user.toJSON() as Record<string, unknown>;
    delete json.googleId;
    delete json.refreshTokenHash;
    delete json.displayNameEdited;
    delete json.avatarEdited;
    delete json.firstName;
    delete json.lastName;
    delete json.provider;
    delete json.lastLoginAt;
    delete json.role;

    return json;
  }

  findByGoogleId(googleId: string) {
    return this.userModel.findOne({ googleId }).exec();
  }

  private async resolveUniqueUsername(email: string) {
    let username = usernameFromEmail(email);
    const taken = await this.userModel.exists({ username }).exec();
    if (taken) {
      username = `${username}${Date.now().toString(36).slice(-4)}`;
    }
    return username;
  }

  private isSuperAdminEmail(email: string) {
    const allowed = this.config.get('superAdminEmails', { infer: true });
    return allowed.includes(email.trim().toLowerCase());
  }

  async syncSuperAdminRole(user: UserDocument) {
    if (!this.isSuperAdminEmail(user.email)) {
      return user;
    }

    if (user.role === 'super_admin') {
      return user;
    }

    user.role = 'super_admin';
    await user.save();
    return user;
  }

  async upsertFromGoogle(profile: GoogleProfilePayload) {
    const existing = await this.userModel
      .findOne({ googleId: profile.googleId })
      .exec();

    if (existing) {
      existing.email = profile.email;
      existing.firstName = profile.firstName;
      existing.lastName = profile.lastName;
      existing.lastLoginAt = new Date();

      if (this.isSuperAdminEmail(profile.email)) {
        existing.role = 'super_admin';
      } else if (!existing.role) {
        existing.role = 'user';
      }

      if (!existing.displayNameEdited) {
        existing.displayName = profile.displayName;
      }

      if (profile.avatarUrl && !existing.avatarEdited) {
        existing.avatarUrl = profile.avatarUrl;
      }

      if (!existing.username) {
        existing.username = await this.resolveUniqueUsername(profile.email);
      }

      await existing.save();
      return existing;
    }

    const username = await this.resolveUniqueUsername(profile.email);

    const user = await this.userModel.create({
      googleId: profile.googleId,
      email: profile.email,
      username,
      displayName: profile.displayName,
      displayNameEdited: false,
      firstName: profile.firstName,
      lastName: profile.lastName,
      avatarUrl: profile.avatarUrl,
      provider: 'google',
      social: {},
      lastLoginAt: new Date(),
      role: this.isSuperAdminEmail(profile.email) ? 'super_admin' : 'user',
    });

    void this.notificationsService.notifyAdmins({
      actorId: user.id,
      type: 'admin_new_user',
      message: `Yangi foydalanuvchi ro'yxatdan o'tdi: ${user.displayName}`,
      link: '/admin?tab=users',
    });

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    if (dto.displayName !== undefined) {
      user.displayName = dto.displayName.trim();
      user.displayNameEdited = true;
    }

    if (dto.bio !== undefined) {
      user.bio = dto.bio.trim();
    }

    if (dto.social) {
      user.social = {
        ...user.social,
        ...Object.fromEntries(
          Object.entries(dto.social).filter(([, v]) => v !== undefined),
        ),
      };
    }

    await user.save();
    return user;
  }

  async updateAvatar(userId: string, filename: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const baseUrl = this.config.get('publicBaseUrl', { infer: true }).replace(
      /\/$/,
      '',
    );
    const version = Date.now();
    user.avatarUrl = `${baseUrl}/uploads/avatars/${filename}?v=${version}`;
    user.avatarEdited = true;
    await user.save();
    return user;
  }

  removeAvatarFilesForUser(userId: string, keepFilename?: string) {
    const dir = ensureAvatarDir();
    const extensions = ['.jpg', '.png', '.webp', '.gif'];
    for (const ext of extensions) {
      const name = `${userId}${ext}`;
      if (keepFilename && name === keepFilename) continue;
      const full = join(dir, name);
      if (existsSync(full)) {
        try {
          unlinkSync(full);
        } catch {
          /* ignore */
        }
      }
    }
  }

  async setRefreshTokenHash(userId: string, hash: string | null) {
    return this.userModel
      .findByIdAndUpdate(userId, { refreshTokenHash: hash })
      .exec();
  }

  findByIdWithRefreshHash(id: string) {
    return this.userModel.findById(id).select('+refreshTokenHash').exec();
  }
}
