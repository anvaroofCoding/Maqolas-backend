import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AppConfig } from '../config/configuration';
import { ModerationService } from '../moderation/moderation.service';
import { containsProfanity } from '../moderation/utils/profanity-filter';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { rtTags } from '../realtime/realtime-tags';
import { CreatePinCommentDto } from './dto/create-pin-comment.dto';
import { CreatePinDto } from './dto/create-pin.dto';
import { ListPinCommentsDto } from './dto/list-pin-comments.dto';
import { ListPinsDto } from './dto/list-pins.dto';
import { Pin, PinDocument } from './schemas/pin.schema';
import { PinComment, PinCommentDocument } from './schemas/pin-comment.schema';
import {
  PinCommentLike,
  PinCommentLikeDocument,
} from './schemas/pin-comment-like.schema';
import { PinLike, PinLikeDocument } from './schemas/pin-like.schema';

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || `rasm-${Date.now()}`
  );
}

@Injectable()
export class PinsService {
  constructor(
    @InjectModel(Pin.name)
    private readonly pinModel: Model<PinDocument>,
    @InjectModel(PinLike.name)
    private readonly likeModel: Model<PinLikeDocument>,
    @InjectModel(PinComment.name)
    private readonly commentModel: Model<PinCommentDocument>,
    @InjectModel(PinCommentLike.name)
    private readonly commentLikeModel: Model<PinCommentLikeDocument>,
    private readonly moderationService: ModerationService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly realtime: RealtimeService,
  ) {}

  private emitPinChange(pinId?: string, slug?: string) {
    const tags = [...rtTags.pinFeed()];
    if (pinId) {
      tags.push(...rtTags.pin(pinId), ...rtTags.pinEngagement(pinId));
    }
    if (slug) {
      tags.push(...rtTags.pinSlug(slug));
    }
    this.realtime.invalidate(tags, { public: true });
  }

  private buildImageUrl(filename: string) {
    const baseUrl = this.config
      .get('publicBaseUrl', { infer: true })
      .replace(/\/$/, '');
    return `${baseUrl}/uploads/pins/${filename}`;
  }

  private async uniqueSlug(base: string) {
    let slug = slugify(base);
    let suffix = 0;

    while (await this.pinModel.exists({ slug })) {
      suffix += 1;
      slug = `${slugify(base).slice(0, 70)}-${suffix}`;
    }

    return slug;
  }

  private toPublicPin(
    pin: PinDocument,
    author?: Record<string, unknown> | null,
    likedByMe = false,
  ) {
    const json = pin.toJSON() as Record<string, unknown>;

    return {
      id: json.id,
      title: json.title,
      description: json.description,
      slug: json.slug,
      imageUrl: json.imageUrl,
      width: json.width,
      height: json.height,
      dominantColor: json.dominantColor,
      viewCount: json.viewCount ?? 0,
      likeCount: json.likeCount ?? 0,
      commentCount: json.commentCount ?? 0,
      publishedAt: json.publishedAt,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
      likedByMe,
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

  async listFeed(query: ListPinsDto, viewerId?: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;
    const skip = (page - 1) * limit;

    const [pins, total] = await Promise.all([
      this.pinModel
        .find({ publishedAt: { $ne: null } })
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'displayName username avatarUrl')
        .exec(),
      this.pinModel.countDocuments({ publishedAt: { $ne: null } }).exec(),
    ]);

    const likedIds = viewerId
      ? await this.getLikedPinIds(
          pins.map((pin) => String(pin._id)),
          viewerId,
        )
      : new Set<string>();

    return {
      pins: pins.map((pin) => {
        const json = pin.toJSON() as Record<string, unknown>;
        const author = json.authorId as Record<string, unknown> | undefined;
        return this.toPublicPin(
          pin,
          author,
          likedIds.has(String(pin._id)),
        );
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async listMine(userId: string, query: ListPinsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;
    const skip = (page - 1) * limit;

    const filter = { authorId: new Types.ObjectId(userId) };

    const [pins, total] = await Promise.all([
      this.pinModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'displayName username avatarUrl')
        .exec(),
      this.pinModel.countDocuments(filter).exec(),
    ]);

    const likedIds = await this.getLikedPinIds(
      pins.map((pin) => String(pin._id)),
      userId,
    );

    return {
      pins: pins.map((pin) => {
        const json = pin.toJSON() as Record<string, unknown>;
        const author = json.authorId as Record<string, unknown> | undefined;
        return this.toPublicPin(
          pin,
          author,
          likedIds.has(String(pin._id)),
        );
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findBySlug(slug: string, viewerId?: string) {
    const pin = await this.pinModel
      .findOne({ slug: slug.trim().toLowerCase(), publishedAt: { $ne: null } })
      .populate('authorId', 'displayName username avatarUrl')
      .exec();

    if (!pin) {
      throw new NotFoundException('Rasm topilmadi');
    }

    pin.viewCount = (pin.viewCount ?? 0) + 1;
    await pin.save();

    const likedByMe = viewerId
      ? Boolean(
          await this.likeModel
            .exists({ pinId: pin._id, userId: new Types.ObjectId(viewerId) })
            .exec(),
        )
      : false;

    const json = pin.toJSON() as Record<string, unknown>;
    const author = json.authorId as Record<string, unknown> | undefined;

    return {
      pin: this.toPublicPin(pin, author, likedByMe),
    };
  }

  async create(userId: string, dto: CreatePinDto, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Rasm fayli yuborilmadi');
    }

    const title = dto.title?.trim() || 'Rasm';
    const description = dto.description?.trim() || undefined;
    const slug = await this.uniqueSlug(title);

    const pin = await this.pinModel.create({
      title,
      description,
      slug,
      imageUrl: this.buildImageUrl(file.filename),
      authorId: new Types.ObjectId(userId),
      width: dto.width,
      height: dto.height,
      publishedAt: new Date(),
    });

    await pin.populate('authorId', 'displayName username avatarUrl');
    const json = pin.toJSON() as Record<string, unknown>;
    const author = json.authorId as Record<string, unknown> | undefined;

    this.emitPinChange(pin.id, pin.slug);

    return { pin: this.toPublicPin(pin, author, false) };
  }

  async getEngagement(pinId: string, viewerId?: string) {
    const pin = await this.findPublishedPinById(pinId);

    const likedByMe = viewerId
      ? Boolean(
          await this.likeModel
            .exists({ pinId: pin._id, userId: new Types.ObjectId(viewerId) })
            .exec(),
        )
      : false;

    return {
      likeCount: pin.likeCount ?? 0,
      commentCount: pin.commentCount ?? 0,
      likedByMe,
    };
  }

  async toggleLike(pinId: string, userId: string) {
    const pin = await this.findPublishedPinById(pinId);
    const userObjectId = new Types.ObjectId(userId);

    const existing = await this.likeModel
      .findOne({ pinId: pin._id, userId: userObjectId })
      .exec();

    if (existing) {
      await existing.deleteOne();
      pin.likeCount = Math.max(0, (pin.likeCount ?? 0) - 1);
      await pin.save();
      this.emitPinChange(pinId, pin.slug);
      return { liked: false, likeCount: pin.likeCount };
    }

    await this.likeModel.create({ pinId: pin._id, userId: userObjectId });
    pin.likeCount = (pin.likeCount ?? 0) + 1;
    await pin.save();

    if (pin.authorId.toString() !== userId) {
      void this.notificationsService.createSafe({
        recipientId: pin.authorId.toString(),
        actorId: userId,
        type: 'article_liked',
        message: 'Rasmingiz yoqtirildi',
        link: `/rasm/${pin.slug}`,
      });
    }

    this.emitPinChange(pinId, pin.slug);
    return { liked: true, likeCount: pin.likeCount };
  }

  async listComments(
    pinId: string,
    query: ListPinCommentsDto,
    viewerId?: string,
  ) {
    const pin = await this.findPublishedPinById(pinId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const comments = await this.commentModel
      .find({ pinId: pin._id })
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
    pinId: string,
    userId: string,
    dto: CreatePinCommentDto,
    authorIp?: string,
  ) {
    await this.moderationService.assertNotBanned(userId, authorIp);

    const pin = await this.findPublishedPinById(pinId);
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
        .findOne({ _id: dto.parentId, pinId: pin._id })
        .exec();

      if (!parent) {
        throw new NotFoundException('Javob berilayotgan izoh topilmadi');
      }

      parentId = parent._id;
    }

    const comment = await this.commentModel.create({
      pinId: pin._id,
      authorId: new Types.ObjectId(userId),
      content,
      parentId,
      authorIp,
    });

    pin.commentCount = (pin.commentCount ?? 0) + 1;
    await pin.save();

    const populated = await this.commentModel
      .findById(comment._id)
      .populate('authorId', 'displayName username avatarUrl')
      .exec();

    if (pin.authorId.toString() !== userId) {
      void this.notificationsService.createSafe({
        recipientId: pin.authorId.toString(),
        actorId: userId,
        type: 'article_commented',
        message: 'Rasmingizga izoh qoldirildi',
        link: `/rasm/${pin.slug}`,
      });
    }

    this.emitPinChange(pinId, pin.slug);

    return {
      comment: this.toPublicComment(populated!),
      commentCount: pin.commentCount,
    };
  }

  async deleteComment(pinId: string, commentId: string, userId: string) {
    const pin = await this.findPublishedPinById(pinId);

    if (!Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Izoh topilmadi');
    }

    const comment = await this.commentModel
      .findOne({ _id: commentId, pinId: pin._id })
      .exec();

    if (!comment) {
      throw new NotFoundException('Izoh topilmadi');
    }

    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('Faqat o\'z izohingizni o\'chira olasiz');
    }

    const allComments = await this.commentModel
      .find({ pinId: pin._id })
      .select('_id parentId')
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

    await Promise.all([
      this.commentModel.deleteMany({ _id: { $in: deleteIds } }).exec(),
      this.commentLikeModel
        .deleteMany({ commentId: { $in: deleteIds } })
        .exec(),
    ]);

    pin.commentCount = Math.max(0, (pin.commentCount ?? 0) - idsToDelete.size);
    await pin.save();

    this.emitPinChange(pinId, pin.slug);

    return {
      deleted: true,
      commentCount: pin.commentCount,
    };
  }

  async toggleCommentLike(
    pinId: string,
    commentId: string,
    userId: string,
  ) {
    await this.findPublishedPinById(pinId);

    if (!Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Izoh topilmadi');
    }

    const comment = await this.commentModel
      .findOne({
        _id: commentId,
        pinId: new Types.ObjectId(pinId),
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
      this.emitPinChange(pinId);
      return { liked: false, likeCount: comment.likeCount };
    }

    await this.commentLikeModel.create({
      commentId: comment._id,
      userId: userObjectId,
    });
    comment.likeCount = (comment.likeCount ?? 0) + 1;
    await comment.save();
    this.emitPinChange(pinId);
    return { liked: true, likeCount: comment.likeCount };
  }

  async listSitemap() {
    const pins = await this.pinModel
      .find({ publishedAt: { $ne: null } })
      .select('slug updatedAt publishedAt')
      .sort({ publishedAt: -1 })
      .limit(5000)
      .lean()
      .exec();

    return {
      entries: (pins as Array<{
        slug: string;
        updatedAt?: Date;
        publishedAt?: Date;
      }>).map((pin) => ({
        slug: pin.slug,
        updatedAt: (
          pin.updatedAt ??
          pin.publishedAt ??
          new Date()
        ).toISOString(),
      })),
    };
  }

  private async findPublishedPinById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Rasm topilmadi');
    }

    const pin = await this.pinModel
      .findOne({ _id: id, publishedAt: { $ne: null } })
      .exec();

    if (!pin) {
      throw new NotFoundException('Rasm topilmadi');
    }

    return pin;
  }

  private toPublicComment(comment: PinCommentDocument) {
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

  private async getLikedPinIds(pinIds: string[], userId: string) {
    if (pinIds.length === 0 || !Types.ObjectId.isValid(userId)) {
      return new Set<string>();
    }

    const pinObjectIds = pinIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (pinObjectIds.length === 0) {
      return new Set<string>();
    }

    const likes = await this.likeModel
      .find({
        pinId: { $in: pinObjectIds },
        userId: new Types.ObjectId(userId),
      })
      .select('pinId')
      .lean()
      .exec();

    return new Set(likes.map((like) => String(like.pinId)));
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
