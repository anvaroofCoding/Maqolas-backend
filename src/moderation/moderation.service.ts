import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Article, ArticleDocument } from '../articles/schemas/article.schema';
import { Comment, CommentDocument } from '../articles/schemas/comment.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateBanDto } from './dto/create-ban.dto';
import { Ban, BanDocument, BanUnit } from './schemas/ban.schema';
import {
  CommentReport,
  CommentReportDocument,
} from './schemas/comment-report.schema';

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
export class ModerationService {
  constructor(
    @InjectModel(CommentReport.name)
    private readonly reportModel: Model<CommentReportDocument>,
    @InjectModel(Ban.name)
    private readonly banModel: Model<BanDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(Article.name)
    private readonly articleModel: Model<ArticleDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

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
