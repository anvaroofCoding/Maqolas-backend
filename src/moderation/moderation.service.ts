import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Article, ArticleDocument } from '../articles/schemas/article.schema';
import { Comment, CommentDocument } from '../articles/schemas/comment.schema';
import {
  CommentLike,
  CommentLikeDocument,
} from '../articles/schemas/comment-like.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  UserFollow,
  UserFollowDocument,
} from '../users/schemas/user-follow.schema';
import { CreateBanDto } from './dto/create-ban.dto';
import { Ban, BanDocument, BanUnit } from './schemas/ban.schema';
import {
  CommentReport,
  CommentReportDocument,
} from './schemas/comment-report.schema';
import {
  APPROVED_COMMENT_FILTER,
  isApprovedCommentStatus,
  PENDING_COMMENT_FILTER,
} from './utils/approved-comment-filter';

function calculateExpiresAt(amount: number, unit: BanUnit): Date | undefined {
  if (unit === 'permanent') return undefined;

  const expiresAt = new Date();

  if (unit === 'hours') {
    expiresAt.setHours(expiresAt.getHours() + amount);
    return expiresAt;
  }

  if (unit === 'days') {
    expiresAt.setDate(expiresAt.getDate() + amount);
    return expiresAt;
  }

  expiresAt.setMonth(expiresAt.getMonth() + amount);
  return expiresAt;
}

@Injectable()
export class ModerationService implements OnModuleInit {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    @InjectModel(CommentReport.name)
    private readonly reportModel: Model<CommentReportDocument>,
    @InjectModel(Ban.name)
    private readonly banModel: Model<BanDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(CommentLike.name)
    private readonly commentLikeModel: Model<CommentLikeDocument>,
    @InjectModel(Article.name)
    private readonly articleModel: Model<ArticleDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(UserFollow.name)
    private readonly followModel: Model<UserFollowDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    const result = await this.commentModel
      .updateMany(
        { status: { $exists: false } },
        { $set: { status: 'pending' } },
      )
      .exec();

    if (result.modifiedCount > 0) {
      this.logger.log(
        `${result.modifiedCount} ta eski izoh "kutilmoqda" holatiga o'tkazildi`,
      );
    }
  }

  async getPlatformStats() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalFollows,
      publishedArticles,
      approvedComments,
      newUsersLast7Days,
      newFollowsLast7Days,
    ] = await Promise.all([
      this.userModel.countDocuments().exec(),
      this.followModel.countDocuments().exec(),
      this.articleModel.countDocuments({ status: 'published' }).exec(),
      this.commentModel.countDocuments(APPROVED_COMMENT_FILTER).exec(),
      this.userModel.countDocuments({ createdAt: { $gte: sevenDaysAgo } }).exec(),
      this.followModel.countDocuments({ createdAt: { $gte: sevenDaysAgo } }).exec(),
    ]);

    return {
      totalUsers,
      totalFollows,
      publishedArticles,
      approvedComments,
      newUsersLast7Days,
      newFollowsLast7Days,
      generatedAt: new Date().toISOString(),
    };
  }

  async assertNotBanned(userId?: string, ip?: string) {
    const ban = await this.findActiveBan(userId, ip);
    if (!ban) return;

    const message = ban.isPermanent
      ? 'Hisobingiz doimiy bloklangan'
      : `Hisobingiz vaqtincha bloklangan. Tugash: ${ban.expiresAt?.toISOString() ?? ''}`;

    throw new ForbiddenException({
      message,
      reason: ban.reason,
      expiresAt: ban.expiresAt ?? null,
      isPermanent: ban.isPermanent,
    });
  }

  async findActiveBan(userId?: string, ip?: string) {
    const now = new Date();
    const orFilters: Record<string, unknown>[] = [];

    if (userId) {
      orFilters.push({ targetUserId: new Types.ObjectId(userId), isActive: true });
    }

    if (ip && ip !== 'unknown') {
      orFilters.push({ ipAddress: ip, isActive: true });
    }

    if (orFilters.length === 0) return null;

    const bans = await this.banModel
      .find({ $or: orFilters, isActive: true })
      .sort({ createdAt: -1 })
      .exec();

    return (
      bans.find(
        (ban) => ban.isPermanent || !ban.expiresAt || ban.expiresAt > now,
      ) ?? null
    );
  }

  async reportComment(
    articleId: string,
    commentId: string,
    reporterId: string,
    reporterIp: string,
    reason?: string,
  ) {
    await this.assertNotBanned(reporterId, reporterIp);

    if (!Types.ObjectId.isValid(articleId) || !Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Izoh topilmadi');
    }

    const comment = await this.commentModel
      .findOne({
        _id: commentId,
        articleId: new Types.ObjectId(articleId),
        ...APPROVED_COMMENT_FILTER,
      })
      .exec();

    if (!comment) {
      throw new NotFoundException('Izoh topilmadi');
    }

    if (comment.authorId.toString() === reporterId) {
      throw new BadRequestException('O\'z izohingizni shikoyat qila olmaysiz');
    }

    const existing = await this.reportModel
      .exists({ commentId: comment._id, reporterId })
      .exec();

    if (existing) {
      throw new BadRequestException('Bu izoh allaqachon shikoyat qilingan');
    }

    const report = await this.reportModel.create({
      reporterId,
      commentId: comment._id,
      articleId: comment.articleId,
      reportedUserId: comment.authorId,
      reason: reason?.trim() || undefined,
      reporterIp,
      reportedUserIp: comment.authorIp,
      status: 'pending',
    });

    return { report: this.toPublicReport(await this.populateReport(report.id)) };
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
        .populate('articleId', 'title slug')
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

    const countByArticle = new Map<string, number>();
    for (const comment of comments) {
      const articleId = comment.articleId.toString();
      countByArticle.set(articleId, (countByArticle.get(articleId) ?? 0) + 1);
    }

    await Promise.all(
      Array.from(countByArticle.entries()).map(([articleId, count]) =>
        this.articleModel
          .updateOne({ _id: articleId }, { $inc: { commentCount: count } })
          .exec(),
      ),
    );

    for (const comment of comments) {
      await this.notifyApprovedComment(comment);
    }

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

    return {
      rejected: comments.length,
      commentIds: comments.map((comment) => comment.id),
    };
  }

  async deleteCommentsByAdmin(commentIds: string[]) {
    const objectIds = this.parseCommentObjectIds(commentIds);
    const selectedComments = await this.commentModel
      .find({ _id: { $in: objectIds } })
      .exec();

    if (selectedComments.length === 0) {
      throw new NotFoundException('Izohlar topilmadi');
    }

    const articleIds = [
      ...new Set(selectedComments.map((comment) => comment.articleId.toString())),
    ];
    const articleObjectIds = articleIds.map((id) => new Types.ObjectId(id));

    const allComments = await this.commentModel
      .find({ articleId: { $in: articleObjectIds } })
      .select('_id parentId status articleId')
      .exec();

    const idsToDelete = new Set<string>(
      selectedComments.map((comment) => comment._id.toString()),
    );
    let expanded = true;

    while (expanded) {
      expanded = false;
      for (const comment of allComments) {
        const id = comment._id.toString();
        const parentId = comment.parentId?.toString();
        if (parentId && idsToDelete.has(parentId) && !idsToDelete.has(id)) {
          idsToDelete.add(id);
          expanded = true;
        }
      }
    }

    const deleteComments = allComments.filter((comment) =>
      idsToDelete.has(comment._id.toString()),
    );
    const deleteObjectIds = deleteComments.map((comment) => comment._id);

    const approvedDeletedByArticle = new Map<string, number>();
    for (const comment of deleteComments) {
      if (!isApprovedCommentStatus(comment.status)) continue;
      const articleId = comment.articleId.toString();
      approvedDeletedByArticle.set(
        articleId,
        (approvedDeletedByArticle.get(articleId) ?? 0) + 1,
      );
    }

    await Promise.all([
      this.commentModel.deleteMany({ _id: { $in: deleteObjectIds } }).exec(),
      this.commentLikeModel
        .deleteMany({ commentId: { $in: deleteObjectIds } })
        .exec(),
      this.reportModel
        .deleteMany({ commentId: { $in: deleteObjectIds } })
        .exec(),
    ]);

    await Promise.all(
      Array.from(approvedDeletedByArticle.entries()).map(([articleId, count]) =>
        this.articleModel
          .updateOne(
            { _id: articleId },
            { $inc: { commentCount: -count } },
          )
          .exec()
          .then(() =>
            this.articleModel
              .updateOne(
                { _id: articleId, commentCount: { $lt: 0 } },
                { $set: { commentCount: 0 } },
              )
              .exec(),
          ),
      ),
    );

    return {
      deleted: deleteObjectIds.length,
      commentIds: deleteComments.map((comment) => comment.id),
    };
  }

  async listReports(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};

    if (status) {
      filter.status = status;
    }

    const [reports, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('reporterId', 'displayName username avatarUrl email')
        .populate('reportedUserId', 'displayName username avatarUrl email')
        .populate('commentId', 'content authorIp createdAt')
        .populate('articleId', 'title slug')
        .exec(),
      this.reportModel.countDocuments(filter).exec(),
    ]);

    return {
      reports: reports.map((report) => this.toPublicReport(report)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async dismissReport(id: string, adminId: string) {
    const report = await this.reportModel.findById(id).exec();
    if (!report) {
      throw new NotFoundException('Shikoyat topilmadi');
    }

    report.status = 'dismissed';
    report.reviewedBy = new Types.ObjectId(adminId);
    report.reviewedAt = new Date();
    await report.save();

    return { report: this.toPublicReport(await this.populateReport(id)) };
  }

  async listUsers(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};

    if (search?.trim()) {
      const query = search.trim();
      filter.$or = [
        { displayName: { $regex: query, $options: 'i' } },
        { username: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('displayName username email avatarUrl role createdAt lastLoginAt')
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    const userIds = users.map((user) => user._id);
    const activeBans = await this.banModel
      .find({
        targetUserId: { $in: userIds },
        isActive: true,
      })
      .exec();

    const banByUserId = new Map(
      activeBans.map((ban) => [ban.targetUserId?.toString(), ban]),
    );

    return {
      users: users.map((user) => {
        const json = user.toJSON() as Record<string, unknown>;
        const ban = banByUserId.get(user.id);
        json.activeBan = ban ? this.toPublicBan(ban) : null;
        return json;
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private validateBanDuration(dto: CreateBanDto) {
    if (dto.durationUnit !== 'permanent' && !dto.durationAmount) {
      throw new BadRequestException('Bloklash muddati ko\'rsatilishi shart');
    }
  }

  async banUser(
    userId: string,
    adminId: string,
    dto: CreateBanDto,
    sourceReportId?: string,
  ) {
    this.validateBanDuration(dto);

    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    if (user.role === 'super_admin') {
      throw new ForbiddenException('Adminni bloklash mumkin emas');
    }

    await this.deactivateUserBans(userId);

    const isPermanent = dto.durationUnit === 'permanent';
    const expiresAt =
      !isPermanent && dto.durationAmount
        ? calculateExpiresAt(dto.durationAmount, dto.durationUnit)
        : undefined;

    const ban = await this.banModel.create({
      targetUserId: user._id,
      ipAddress: dto.ipAddress?.trim() || undefined,
      reason: dto.reason.trim(),
      bannedBy: new Types.ObjectId(adminId),
      expiresAt,
      isPermanent,
      isActive: true,
      sourceReportId: sourceReportId
        ? new Types.ObjectId(sourceReportId)
        : undefined,
      durationAmount: dto.durationAmount,
      durationUnit: dto.durationUnit,
    });

    if (sourceReportId) {
      await this.markReportReviewed(sourceReportId, adminId);
    }

    return { ban: this.toPublicBan(ban) };
  }

  async banIp(adminId: string, dto: CreateBanDto, sourceReportId?: string) {
    this.validateBanDuration(dto);

    const ip = dto.ipAddress?.trim();
    if (!ip) {
      throw new BadRequestException('IP manzil kiritilishi shart');
    }

    await this.deactivateIpBans(ip);

    const isPermanent = dto.durationUnit === 'permanent';
    const expiresAt =
      !isPermanent && dto.durationAmount
        ? calculateExpiresAt(dto.durationAmount, dto.durationUnit)
        : undefined;

    const ban = await this.banModel.create({
      ipAddress: ip,
      reason: dto.reason.trim(),
      bannedBy: new Types.ObjectId(adminId),
      expiresAt,
      isPermanent,
      isActive: true,
      sourceReportId: sourceReportId
        ? new Types.ObjectId(sourceReportId)
        : undefined,
      durationAmount: dto.durationAmount,
      durationUnit: dto.durationUnit,
    });

    if (sourceReportId) {
      await this.markReportReviewed(sourceReportId, adminId);
    }

    return { ban: this.toPublicBan(ban) };
  }

  async unbanUser(userId: string) {
    await this.deactivateUserBans(userId);
    return { success: true };
  }

  async unbanIp(ip: string) {
    await this.deactivateIpBans(ip);
    return { success: true };
  }

  private async deactivateUserBans(userId: string) {
    await this.banModel
      .updateMany(
        { targetUserId: new Types.ObjectId(userId), isActive: true },
        { $set: { isActive: false } },
      )
      .exec();
  }

  private async deactivateIpBans(ip: string) {
    await this.banModel
      .updateMany({ ipAddress: ip, isActive: true }, { $set: { isActive: false } })
      .exec();
  }

  private async markReportReviewed(reportId: string, adminId: string) {
    await this.reportModel
      .updateOne(
        { _id: reportId },
        {
          $set: {
            status: 'reviewed',
            reviewedBy: new Types.ObjectId(adminId),
            reviewedAt: new Date(),
          },
        },
      )
      .exec();
  }

  private async populateReport(id: string) {
    return this.reportModel
      .findById(id)
      .populate('reporterId', 'displayName username avatarUrl email')
      .populate('reportedUserId', 'displayName username avatarUrl email')
      .populate('commentId', 'content authorIp createdAt')
      .populate('articleId', 'title slug')
      .exec();
  }

  private parseCommentObjectIds(commentIds: string[]) {
    const uniqueIds = [...new Set(commentIds.filter(Boolean))];
    const objectIds = uniqueIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      throw new BadRequestException('Kamida bitta izoh tanlang');
    }

    return objectIds;
  }

  private async actorDisplayName(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('displayName username')
      .lean()
      .exec();
    return user?.displayName ?? user?.username ?? 'Kimdir';
  }

  private async notifyApprovedComment(comment: CommentDocument) {
    const article = await this.articleModel
      .findById(comment.articleId)
      .select('slug authorId')
      .exec();

    if (!article) return;

    const actorName = await this.actorDisplayName(comment.authorId.toString());

    void this.notificationsService.createSafe({
      recipientId: article.authorId.toString(),
      actorId: comment.authorId.toString(),
      type: 'article_commented',
      message: `${actorName} maqolangizga izoh qoldirdi`,
      link: `/maqola/${article.slug}`,
      articleId: article.id,
    });

    if (!comment.parentId) return;

    const parent = await this.commentModel.findById(comment.parentId).exec();
    if (!parent) return;

    void this.notificationsService.createSafe({
      recipientId: parent.authorId.toString(),
      actorId: comment.authorId.toString(),
      type: 'comment_replied',
      message: `${actorName} izohingizga javob berdi`,
      link: `/maqola/${article.slug}`,
      articleId: article.id,
    });
  }

  private toModerationComment(comment: CommentDocument) {
    const json = comment.toJSON() as Record<string, unknown>;
    json.author = this.mapUser(json.authorId);

    const article = json.articleId as
      | {
          id?: string;
          _id?: { toString(): string };
          title?: string;
          slug?: string;
        }
      | undefined;

    if (article && typeof article === 'object') {
      json.article = {
        id: article.id ?? article._id?.toString(),
        title: article.title,
        slug: article.slug,
      };
    }

    if (json.parentId) {
      json.parentId = String(json.parentId);
    }

    delete json.authorId;
    delete json.articleId;

    return json;
  }

  private mapUser(raw: unknown) {
    if (!raw || typeof raw !== 'object') return undefined;

    const user = raw as {
      id?: string;
      _id?: { toString(): string };
      displayName?: string;
      username?: string;
      avatarUrl?: string;
      email?: string;
    };

    return {
      id: user.id ?? user._id?.toString(),
      displayName: user.displayName,
      username: user.username,
      avatarUrl: user.avatarUrl,
      email: user.email,
    };
  }

  private toPublicReport(report: CommentReportDocument | null) {
    if (!report) return null;

    const json = report.toJSON() as Record<string, unknown>;
    json.reporter = this.mapUser(json.reporterId);
    json.reportedUser = this.mapUser(json.reportedUserId);

    const comment = json.commentId as
      | {
          id?: string;
          _id?: { toString(): string };
          content?: string;
          authorIp?: string;
          createdAt?: Date;
        }
      | undefined;

    if (comment && typeof comment === 'object') {
      json.comment = {
        id: comment.id ?? comment._id?.toString(),
        content: comment.content,
        authorIp: comment.authorIp,
        createdAt: comment.createdAt,
      };
    }

    const article = json.articleId as
      | {
          id?: string;
          _id?: { toString(): string };
          title?: string;
          slug?: string;
        }
      | undefined;

    if (article && typeof article === 'object') {
      json.article = {
        id: article.id ?? article._id?.toString(),
        title: article.title,
        slug: article.slug,
      };
    }

    delete json.reporterId;
    delete json.reportedUserId;
    delete json.commentId;
    delete json.articleId;

    return json;
  }

  private toPublicBan(ban: BanDocument) {
    const json = ban.toJSON() as Record<string, unknown>;

    if (json.targetUserId) {
      json.targetUserId = String(json.targetUserId);
    }

    if (json.bannedBy) {
      json.bannedBy = String(json.bannedBy);
    }

    return json;
  }
}
