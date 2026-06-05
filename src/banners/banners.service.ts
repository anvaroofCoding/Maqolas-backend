import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Model, Types } from 'mongoose';
import type { AppConfig } from '../config/configuration';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { ensureBannerDir } from './banner-upload.config';
import { Banner, BannerDocument } from './schemas/banner.schema';

@Injectable()
export class BannersService {
  constructor(
    @InjectModel(Banner.name)
    private readonly bannerModel: Model<BannerDocument>,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  listActive() {
    return this.bannerModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .exec()
      .then((banners) => ({
        banners: banners.map((banner) => banner.toJSON()),
      }));
  }

  listAll() {
    return this.bannerModel
      .find()
      .sort({ sortOrder: 1, createdAt: -1 })
      .exec()
      .then((banners) => ({
        banners: banners.map((banner) => banner.toJSON()),
      }));
  }

  async create(dto: CreateBannerDto, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Banner rasmi yuborilmadi');
    }

    const linkUrl = dto.linkUrl.trim();
    if (!linkUrl) {
      throw new BadRequestException('Havola kiritilishi shart');
    }

    const banner = await this.bannerModel.create({
      title: dto.title?.trim() || undefined,
      imageUrl: this.buildImageUrl(file.filename),
      linkUrl,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });

    return { banner: banner.toJSON() };
  }

  async update(
    id: string,
    dto: UpdateBannerDto,
    file?: Express.Multer.File,
  ) {
    const banner = await this.findById(id);

    if (dto.title !== undefined) {
      banner.title = dto.title.trim() || undefined;
    }

    if (dto.linkUrl !== undefined) {
      const linkUrl = dto.linkUrl.trim();
      if (!linkUrl) {
        throw new BadRequestException('Havola bo\'sh bo\'lmasligi kerak');
      }
      banner.linkUrl = linkUrl;
    }

    if (dto.isActive !== undefined) {
      banner.isActive = dto.isActive;
    }

    if (dto.sortOrder !== undefined) {
      banner.sortOrder = dto.sortOrder;
    }

    if (file) {
      this.removeImageFile(banner.imageUrl);
      banner.imageUrl = this.buildImageUrl(file.filename);
    }

    await banner.save();
    return { banner: banner.toJSON() };
  }

  async remove(id: string) {
    const banner = await this.findById(id);
    this.removeImageFile(banner.imageUrl);
    await banner.deleteOne();
    return { deleted: true };
  }

  private async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Banner topilmadi');
    }

    const banner = await this.bannerModel.findById(id).exec();
    if (!banner) {
      throw new NotFoundException('Banner topilmadi');
    }

    return banner;
  }

  private buildImageUrl(filename: string) {
    const baseUrl = this.config.get('publicBaseUrl', { infer: true }).replace(
      /\/$/,
      '',
    );
    return `${baseUrl}/uploads/banners/${filename}`;
  }

  private removeImageFile(imageUrl: string) {
    const filename = imageUrl.split('/').pop()?.split('?')[0];
    if (!filename) return;

    const fullPath = join(ensureBannerDir(), filename);
    if (existsSync(fullPath)) {
      try {
        unlinkSync(fullPath);
      } catch {
        /* ignore */
      }
    }
  }
}
