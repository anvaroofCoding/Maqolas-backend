import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Model, Types } from 'mongoose';
import type { AppConfig } from '../config/configuration';
import { ModerationService } from '../moderation/moderation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { rtTags } from '../realtime/realtime-tags';
import {
  APPROVED_COMMENT_FILTER,
  PENDING_COMMENT_FILTER,
} from '../moderation/utils/approved-comment-filter';
import { containsProfanity } from '../moderation/utils/profanity-filter';
import { CreatePromoCommentDto } from './dto/create-promo-comment.dto';
import { CreateWelcomePromoDto } from './dto/create-welcome-promo.dto';
import { ListPromoCommentsDto } from './dto/list-promo-comments.dto';
import { UpdateWelcomePromoDto } from './dto/update-welcome-promo.dto';
import { ensurePromoDir } from './promo-upload.config';
import {
  WelcomePromo,
  WelcomePromoDocument,
} from './schemas/welcome-promo.schema';
import {
  WelcomePromoComment,
  WelcomePromoCommentDocument,
} from './schemas/welcome-promo-comment.schema';
import {
  WelcomePromoCommentLike,
  WelcomePromoCommentLikeDocument,
} from './schemas/welcome-promo-comment-like.schema';
import { runStringUserIdMigrationSafe } from '../common/migrate-string-user-ids';

@Injectable()
export class WelcomePromoService implements OnModuleInit {
  constructor(
    @InjectModel(WelcomePromo.name)
    private readonly promoModel: Model<WelcomePromoDocument>,
    @InjectModel(WelcomePromoComment.name)
    private readonly commentModel: Model<WelcomePromoCommentDocument>,
    @InjectModel(WelcomePromoCommentLike.name)
    private readonly commentLikeModel: Model<WelcomePromoCommentLikeDocument>,
    private readonly moderationService: ModerationService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly realtime: RealtimeService,
  ) {}

  async onModuleInit() {
    await runStringUserIdMigrationSafe(
      this.commentLikeModel,
      'welcome-promo-commentlikes',
    );
  }

  private emitPromoChange(promoId?: string) {
    const tags = [...rtTags.welcomePromoActive(), ...rtTags.welcomePromoAdmin()];
    if (promoId) {
      tags.push(...rtTags.welcomePromoComments(promoId));
    }
    this.realtime.invalidate(tags, { public: true, admin: true });
  }

  async getActive() {
    const promo = await this.promoModel
      .findOne({ isActive: true })
      .sort({ updatedAt: -1 })
      .exec();

    return { promo: promo ? promo.toJSON() : null };
  }

  listAll() {
    return this.promoModel
      .find()
      .sort({ updatedAt: -1 })
      .exec()
      .then((promos) => ({
        promos: promos.map((promo) => promo.toJSON()),
      }));
  }

  async create(dto: CreateWelcomePromoDto, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Reklama rasmi yuborilmadi');
    }

    const title = dto.title.trim();
    const description = dto.description.trim();
    if (!title || !description) {
      throw new BadRequestException('Sarlavha va tavsif kiritilishi shart');
    }

    const isActive = dto.isActive ?? false;
    if (isActive) {
      await this.deactivateAll();
    }

    const linkUrl = dto.linkUrl?.trim() || undefined;
    const linkLabel = dto.linkLabel?.trim() || undefined;
    const badgeText = dto.badgeText?.trim() || undefined;
    const badgeIcon = badgeText ? dto.badgeIcon?.trim() || 'badge-check' : undefined;

    const promo = await this.promoModel.create({
      title,
      description,
      imageUrl: this.buildImageUrl(file.filename),
      linkUrl,
      linkLabel: linkUrl && linkLabel ? linkLabel : undefined,
      badgeIcon,
      badgeText,
      isActive,
    });

    this.emitPromoChange(promo.id);

    return { promo: promo.toJSON() };
  }

  async update(
    id: string,
    dto: UpdateWelcomePromoDto,
    file?: Express.Multer.File,
  ) {
    const promo = await this.findById(id);

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) {
        throw new BadRequestException('Sarlavha bo\'sh bo\'lmasligi kerak');
      }
      promo.title = title;
    }

    if (dto.description !== undefined) {
      const description = dto.description.trim();
      if (!description) {
        throw new BadRequestException('Tavsif bo\'sh bo\'lmasligi kerak');
      }
      promo.description = description;
    }

    if (dto.linkUrl !== undefined) {
      promo.linkUrl = dto.linkUrl.trim() || undefined;
      if (!promo.linkUrl) {
        promo.linkLabel = undefined;
      }
    }

    if (dto.linkLabel !== undefined) {
      const linkLabel = dto.linkLabel.trim() || undefined;
      promo.linkLabel =
        promo.linkUrl && linkLabel ? linkLabel : undefined;
    }

    if (dto.badgeText !== undefined) {
      const badgeText = dto.badgeText.trim() || undefined;
      promo.badgeText = badgeText;
      if (!badgeText) {
        promo.badgeIcon = undefined;
      } else if (!promo.badgeIcon) {
        promo.badgeIcon = 'badge-check';
      }
    }

    if (dto.badgeIcon !== undefined) {
      const badgeIcon = dto.badgeIcon.trim() || undefined;
      promo.badgeIcon =
        promo.badgeText && badgeIcon ? badgeIcon : undefined;
    }

    if (dto.isActive !== undefined) {
      if (dto.isActive) {
        await this.deactivateAllExcept(id);
      }
      promo.isActive = dto.isActive;
    }

    if (file) {
      this.removeImageFile(promo.imageUrl);
      promo.imageUrl = this.buildImageUrl(file.filename);
    }

    await promo.save();
    this.emitPromoChange(promo.id);
    return { promo: promo.toJSON() };
  }

  async remove(id: string) {
    const promo = await this.findById(id);
    this.removeImageFile(promo.imageUrl);

    const commentIds = await this.commentModel
      .find({ promoId: promo._id })
      .select('_id')
      .lean()
      .exec();

    const ids = commentIds.map((comment) => comment._id);

    await Promise.all([
      this.commentLikeModel.deleteMany({ commentId: { $in: ids } }).exec(),
      this.commentModel.deleteMany({ promoId: promo._id }).exec(),
      promo.deleteOne(),
    ]);

    this.emitPromoChange(id);

    return { deleted: true };
  }

  async listComments(
    promoId: string,
    query: ListPromoCommentsDto,
    viewerId?: string,
  ) {
    const promo = await this.findActivePromoById(promoId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const comments = await this.commentModel
      .find({ promoId: promo._id, ...APPROVED_COMMENT_FILTER })
      .sort({ createdAt: 1 })
      .populate('authorId', 'displayName username avatarUrl')
      .exec();

    const likedIds = viewerId
      ? await this.getLikedCommentIds(
          comments.map((comment) => String(comment._id)),
          viewerId,
        )
      : new Set<string>();

    const publicComments = comments.map((comment) => ({
      ...this.toPublicComment(comment),
      likedByMe: likedIds.has(String(comment._id)),
    }));
    const roots = this.buildCommentTree(publicComments);

    const total = roots.length;
    const skip = (page - 1) * limit;
    const paginatedRoots = roots.slice(skip, skip + limit);

    return {
      comments: paginatedRoots,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async createComment(
    promoId: string,
    userId: string,
    dto: CreatePromoCommentDto,
    authorIp?: string,
  ) {
    await this.moderationService.assertNotBanned(userId, authorIp);

    const promo = await this.findActivePromoById(promoId);
    const content = dto.content.trim();

    if (!content) {
      throw new ForbiddenException('Izoh bo\'sh bo\'lmasligi kerak');
    }
    if (containsProfanity(content)) {
      throw new BadRequestException(
        'Izohda taqiqlangan so\'zlar bor. Iltimos, izohni tozalab qayta yuboring.',
      );
    }

    let parentId: Types.ObjectId | undefined;

    if (dto.parentId) {
      if (!Types.ObjectId.isValid(dto.parentId)) {
        throw new NotFoundException('Javob berilayotgan izoh topilmadi');
      }

      const parent = await this.commentModel
        .findOne({
          _id: dto.parentId,
          promoId: promo._id,
          ...APPROVED_COMMENT_FILTER,
        })
        .exec();

      if (!parent) {
        throw new NotFoundException('Javob berilayotgan izoh topilmadi');
      }

      parentId = parent._id;
    }

    const comment = await this.commentModel.create({
      promoId: promo._id,
      authorId: userId,
      content,
      parentId,
      authorIp,
      status: 'pending',
    });

    const populated = await this.commentModel
      .findById(comment._id)
      .populate('authorId', 'displayName username avatarUrl')
      .exec();

    void this.notificationsService.notifyAdmins({
      actorId: userId,
      type: 'admin_welcome_promo_comment',
      message: 'Kirish reklamasi izohi moderatsiyaga yuborildi',
      link: '/admin?tab=welcome-promo',
    });

    this.realtime.invalidate(rtTags.welcomePromoModeration(), { admin: true });

    return {
      comment: this.toPublicComment(populated!),
      commentCount: promo.commentCount ?? 0,
      pending: true,
    };
  }

  async deleteComment(promoId: string, commentId: string, userId: string) {
    const promo = await this.findActivePromoById(promoId);

    if (!Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Izoh topilmadi');
    }

    const comment = await this.commentModel
      .findOne({
        _id: commentId,
        promoId: promo._id,
        ...APPROVED_COMMENT_FILTER,
      })
      .exec();

    if (!comment) {
      throw new NotFoundException('Izoh topilmadi');
    }

    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('Faqat o\'z izohingizni o\'chira olasiz');
    }

    const allComments = await this.commentModel
      .find({ promoId: promo._id })
      .select('_id parentId status')
      .exec();

    const idsToDelete = new Set<string>([comment._id.toString()]);
    let expanded = true;

    while (expanded) {
      expanded = false;
      for (const item of allComments) {
        const id = item._id.toString();
        const parent = item.parentId?.toString();
        if (parent && idsToDelete.has(parent) && !idsToDelete.has(id)) {
          idsToDelete.add(id);
          expanded = true;
        }
      }
    }

    const deleteIds = Array.from(idsToDelete).map((id) => new Types.ObjectId(id));
    const approvedDeleteCount = allComments.filter(
      (item) =>
        idsToDelete.has(item._id.toString()) &&
        (!item.status || item.status === 'approved'),
    ).length;

    await Promise.all([
      this.commentModel.deleteMany({ _id: { $in: deleteIds } }).exec(),
      this.commentLikeModel
        .deleteMany({ commentId: { $in: deleteIds } })
        .exec(),
    ]);

    if (approvedDeleteCount > 0) {
      promo.commentCount = Math.max(
        0,
        (promo.commentCount ?? 0) - approvedDeleteCount,
      );
      await promo.save();
    }

    this.emitPromoChange(promoId);

    return {
      deleted: true,
      commentCount: promo.commentCount ?? 0,
    };
  }

  async toggleCommentLike(
    promoId: string,
    commentId: string,
    userId: string,
  ) {
    await this.findActivePromoById(promoId);

    if (!Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Izoh topilmadi');
    }

    const comment = await this.commentModel
      .findOne({
        _id: commentId,
        promoId: new Types.ObjectId(promoId),
        ...APPROVED_COMMENT_FILTER,
      })
      .exec();

    if (!comment) {
      throw new NotFoundException('Izoh topilmadi');
    }

    const userObjectId = new Types.ObjectId(userId);
    const existing = await this.commentLikeModel
      .findOne({ commentId: comment._id, userId: userObjectId })
      .exec();

    if (existing) {
      await existing.deleteOne();
      comment.likeCount = Math.max(0, (comment.likeCount ?? 0) - 1);
      await comment.save();
      this.emitPromoChange(promoId);
      return { liked: false, likeCount: comment.likeCount };
    }

    await this.commentLikeModel.create({
      commentId: comment._id,
      userId: userObjectId,
    });
    comment.likeCount = (comment.likeCount ?? 0) + 1;
    await comment.save();
    this.emitPromoChange(promoId);
    return { liked: true, likeCount: comment.likeCount };
  }

  async listCommentsForModeration(
    page = 1,
    limit = 20,
    status: 'pending' | 'approved' | 'rejected' = 'pending',
  ) {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> =
      status === 'pending' ? PENDING_COMMENT_FILTER : { status };

    const [comments, total] = await Promise.all([
      this.commentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'displayName username avatarUrl email')
        .populate('promoId', 'title')
        .exec(),
      this.commentModel.countDocuments(filter).exec(),
    ]);

    return {
      comments: comments.map((comment) => this.toModerationComment(comment)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async approveComments(commentIds: string[], adminId: string) {
    const objectIds = this.parseCommentObjectIds(commentIds);
    const comments = await this.commentModel
      .find({ _id: { $in: objectIds }, ...PENDING_COMMENT_FILTER })
      .exec();

    if (comments.length === 0) {
      throw new BadRequestException('Tasdiqlanadigan izohlar topilmadi');
    }

    const now = new Date();
    const adminObjectId = new Types.ObjectId(adminId);

    await this.commentModel
      .updateMany(
        { _id: { $in: comments.map((comment) => comment._id) } },
        {
          $set: {
            status: 'approved',
            reviewedBy: adminObjectId,
            reviewedAt: now,
            rejectReason: undefined,
          },
        },
      )
      .exec();

    const countByPromo = new Map<string, number>();
    for (const comment of comments) {
      const id = comment.promoId.toString();
      countByPromo.set(id, (countByPromo.get(id) ?? 0) + 1);
    }

    await Promise.all(
      Array.from(countByPromo.entries()).map(([promoId, count]) =>
        this.promoModel
          .updateOne({ _id: promoId }, { $inc: { commentCount: count } })
          .exec(),
      ),
    );

    for (const promoId of countByPromo.keys()) {
      this.emitPromoChange(promoId);
    }
    this.realtime.invalidate(rtTags.welcomePromoModeration(), { admin: true });

    return {
      approved: comments.length,
      commentIds: comments.map((comment) => comment.id),
    };
  }

  async rejectComments(
    commentIds: string[],
    adminId: string,
    reason?: string,
  ) {
    const objectIds = this.parseCommentObjectIds(commentIds);
    const comments = await this.commentModel
      .find({ _id: { $in: objectIds }, ...PENDING_COMMENT_FILTER })
      .exec();

    if (comments.length === 0) {
      throw new BadRequestException('Rad etiladigan izohlar topilmadi');
    }

    const trimmedReason = reason?.trim() || undefined;
    const now = new Date();
    const adminObjectId = new Types.ObjectId(adminId);

    await this.commentModel
      .updateMany(
        { _id: { $in: comments.map((comment) => comment._id) } },
        {
          $set: {
            status: 'rejected',
            reviewedBy: adminObjectId,
            reviewedAt: now,
            rejectReason: trimmedReason,
          },
        },
      )
      .exec();

    this.realtime.invalidate(rtTags.welcomePromoModeration(), { admin: true });

    return {
      rejected: comments.length,
      commentIds: comments.map((comment) => comment.id),
    };
  }

  async deleteCommentsByAdmin(commentIds: string[]) {
    const objectIds = this.parseCommentObjectIds(commentIds);
    const comments = await this.commentModel
      .find({ _id: { $in: objectIds } })
      .exec();

    if (comments.length === 0) {
      throw new BadRequestException('O\'chiriladigan izohlar topilmadi');
    }

    const approvedCountByPromo = new Map<string, number>();
    for (const comment of comments) {
      if (comment.status === 'approved') {
        const promoId = comment.promoId.toString();
        approvedCountByPromo.set(
          promoId,
          (approvedCountByPromo.get(promoId) ?? 0) + 1,
        );
      }
    }

    await Promise.all([
      this.commentLikeModel
        .deleteMany({ commentId: { $in: objectIds } })
        .exec(),
      this.commentModel.deleteMany({ _id: { $in: objectIds } }).exec(),
    ]);

    await Promise.all(
      Array.from(approvedCountByPromo.entries()).map(([promoId, count]) =>
        this.promoModel
          .updateOne(
            { _id: promoId },
            { $inc: { commentCount: -count } },
          )
          .exec(),
      ),
    );

    const promoIds = new Set([
      ...approvedCountByPromo.keys(),
      ...comments.map((comment) => comment.promoId.toString()),
    ]);
    for (const promoId of promoIds) {
      this.emitPromoChange(promoId);
    }
    this.realtime.invalidate(rtTags.welcomePromoModeration(), { admin: true });

    return {
      deleted: comments.length,
      commentIds: comments.map((comment) => comment.id),
    };
  }

  private parseCommentObjectIds(commentIds: string[]) {
    const objectIds = commentIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      throw new BadRequestException('Izoh IDlari noto\'g\'ri');
    }

    return objectIds;
  }

  private async deactivateAll() {
    await this.promoModel
      .updateMany({ isActive: true }, { $set: { isActive: false } })
      .exec();
  }

  private async deactivateAllExcept(id: string) {
    await this.promoModel
      .updateMany(
        { _id: { $ne: id }, isActive: true },
        { $set: { isActive: false } },
      )
      .exec();
  }

  private async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Reklama topilmadi');
    }

    const promo = await this.promoModel.findById(id).exec();
    if (!promo) {
      throw new NotFoundException('Reklama topilmadi');
    }

    return promo;
  }

  private async findActivePromoById(id: string) {
    const promo = await this.findById(id);
    if (!promo.isActive) {
      throw new NotFoundException('Reklama topilmadi');
    }
    return promo;
  }

  private buildImageUrl(filename: string) {
    const baseUrl = this.config.get('publicBaseUrl', { infer: true }).replace(
      /\/$/,
      '',
    );
    return `${baseUrl}/uploads/welcome-promo/${filename}`;
  }

  private removeImageFile(imageUrl: string) {
    const filename = imageUrl.split('/').pop()?.split('?')[0];
    if (!filename) return;

    const fullPath = join(ensurePromoDir(), filename);
    if (existsSync(fullPath)) {
      try {
        unlinkSync(fullPath);
      } catch {
        /* ignore */
      }
    }
  }

  private toPublicComment(comment: WelcomePromoCommentDocument) {
    const json = comment.toJSON() as Record<string, unknown>;
    const author = json.authorId as Record<string, unknown> | undefined;

    return {
      id: json.id,
      content: json.content,
      parentId: json.parentId ? String(json.parentId) : undefined,
      likeCount: json.likeCount ?? 0,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
      author: author
        ? {
            id: String(author.id ?? author._id),
            displayName: author.displayName as string,
            username: author.username as string | undefined,
            avatarUrl: author.avatarUrl as string | undefined,
          }
        : undefined,
    };
  }

  private toModerationComment(comment: WelcomePromoCommentDocument) {
    const json = comment.toJSON() as Record<string, unknown>;
    const author = json.authorId as Record<string, unknown> | undefined;
    const promo = json.promoId as Record<string, unknown> | undefined;

    return {
      id: json.id,
      content: json.content,
      status: json.status,
      createdAt: json.createdAt,
      author: author
        ? {
            id: String(author.id ?? author._id),
            displayName: author.displayName as string,
            username: author.username as string | undefined,
            avatarUrl: author.avatarUrl as string | undefined,
            email: author.email as string | undefined,
          }
        : undefined,
      promo: promo
        ? {
            id: String(promo.id ?? promo._id),
            title: promo.title as string,
          }
        : undefined,
    };
  }

  private async getLikedCommentIds(commentIds: string[], userId: string) {
    if (commentIds.length === 0 || !Types.ObjectId.isValid(userId)) {
      return new Set<string>();
    }

    const commentObjectIds = commentIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (commentObjectIds.length === 0) {
      return new Set<string>();
    }

    const likes = await this.commentLikeModel
      .find({
        commentId: { $in: commentObjectIds },
        userId: new Types.ObjectId(userId),
      })
      .select('commentId')
      .lean()
      .exec();

    return new Set(likes.map((like) => String(like.commentId)));
  }

  private buildCommentTree(
    comments: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    const byId = new Map<string, Record<string, unknown>>();
    const roots: Array<Record<string, unknown>> = [];

    for (const comment of comments) {
      byId.set(String(comment.id), { ...comment, replies: [] });
    }

    for (const comment of comments) {
      const node = byId.get(String(comment.id))!;
      const parentId = comment.parentId ? String(comment.parentId) : null;

      if (parentId && byId.has(parentId)) {
        const parent = byId.get(parentId)!;
        (parent.replies as Array<Record<string, unknown>>).push(node);
      } else if (!parentId) {
        roots.push(node);
      }
    }

    return roots.sort((a, b) => {
      const aTime = new Date(String(a.createdAt ?? 0)).getTime();
      const bTime = new Date(String(b.createdAt ?? 0)).getTime();
      return bTime - aTime;
    });
  }
}
