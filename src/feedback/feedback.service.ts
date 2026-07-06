import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { containsProfanity } from '../moderation/utils/profanity-filter';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { rtTags } from '../realtime/realtime-tags';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { Feedback, FeedbackDocument } from './schemas/feedback.schema';

const APPROVED_FILTER = { status: 'approved' as const };
const PENDING_FILTER = { status: 'pending' as const };

@Injectable()
export class FeedbackService {
  constructor(
    @InjectModel(Feedback.name)
    private readonly feedbackModel: Model<FeedbackDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  private emitFeedbackChange() {
    this.realtime.invalidate(
      [...rtTags.feedbackList(), ...rtTags.feedbackModeration()],
      { public: true, admin: true },
    );
  }

  async create(authorId: string, dto: CreateFeedbackDto) {
    const content = dto.content.trim();
    if (content.length < 10) {
      throw new BadRequestException(
        "Feedback kamida 10 ta belgidan iborat bo'lishi kerak",
      );
    }

    if (containsProfanity(content)) {
      throw new BadRequestException(
        "Feedbackda nomaqbul so'zlar aniqlandi",
      );
    }

    const recentPending = await this.feedbackModel
      .findOne({
        authorId: new Types.ObjectId(authorId),
        status: 'pending',
        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
      })
      .lean()
      .exec();

    if (recentPending) {
      throw new BadRequestException(
        "Sizda allaqachon ko'rib chiqilayotgan feedback bor. Biroz kuting.",
      );
    }

    const feedback = await this.feedbackModel.create({
      authorId: new Types.ObjectId(authorId),
      content,
      rating: dto.rating,
      status: 'pending',
    });

    void this.notificationsService.notifyAdmins({
      actorId: authorId,
      type: 'admin_feedback_review',
      message: 'Yangi feedback moderatsiyaga yuborildi',
      link: '/admin?tab=feedback',
    });

    this.emitFeedbackChange();

    return { feedback: this.toPublicFeedback(feedback), pending: true };
  }

  async listApproved(page = 1, limit = 20) {
    const cappedLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (page - 1) * cappedLimit;

    const [items, total, stats] = await Promise.all([
      this.feedbackModel
        .find(APPROVED_FILTER)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(cappedLimit)
        .populate('authorId', 'displayName username avatarUrl')
        .exec(),
      this.feedbackModel.countDocuments(APPROVED_FILTER).exec(),
      this.getStats(),
    ]);

    return {
      feedback: items.map((item) => this.toPublicFeedback(item)),
      stats: {
        approvedCount: stats.approvedCount,
        averageRating: stats.averageRating,
      },
      pagination: {
        page,
        limit: cappedLimit,
        total,
        totalPages: Math.ceil(total / cappedLimit) || 1,
      },
    };
  }

  async listRecentApproved(limit = 5) {
    const cappedLimit = Math.min(Math.max(limit, 1), 12);
    const items = await this.feedbackModel
      .find(APPROVED_FILTER)
      .sort({ createdAt: -1 })
      .limit(cappedLimit)
      .populate('authorId', 'displayName username avatarUrl')
      .exec();

    return {
      feedback: items.map((item) => this.toPublicFeedback(item)),
    };
  }

  async listTopApproved(limit = 2) {
    const cappedLimit = Math.min(Math.max(limit, 1), 12);
    const items = await this.feedbackModel
      .find(APPROVED_FILTER)
      .sort({ rating: -1, createdAt: -1 })
      .limit(cappedLimit)
      .populate('authorId', 'displayName username avatarUrl')
      .exec();

    return {
      feedback: items.map((item) => this.toPublicFeedback(item)),
    };
  }

  async getStats() {
    const [approved, pending] = await Promise.all([
      this.feedbackModel.countDocuments(APPROVED_FILTER).exec(),
      this.feedbackModel.countDocuments(PENDING_FILTER).exec(),
    ]);

    const avgResult = await this.feedbackModel
      .aggregate<{ avgRating: number | null }>([
        { $match: { ...APPROVED_FILTER, rating: { $exists: true, $ne: null } } },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } },
      ])
      .exec();

    return {
      approvedCount: approved,
      pendingCount: pending,
      averageRating: avgResult[0]?.avgRating
        ? Math.round(avgResult[0].avgRating * 10) / 10
        : null,
    };
  }

  async listForModeration(
    page = 1,
    limit = 50,
    status: 'pending' | 'approved' | 'rejected' = 'pending',
  ) {
    const cappedLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (page - 1) * cappedLimit;
    const filter = { status };

    const [items, total] = await Promise.all([
      this.feedbackModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(cappedLimit)
        .populate('authorId', 'displayName username avatarUrl email')
        .exec(),
      this.feedbackModel.countDocuments(filter).exec(),
    ]);

    return {
      feedback: items.map((item) => this.toPublicFeedback(item)),
      pagination: {
        page,
        limit: cappedLimit,
        total,
        totalPages: Math.ceil(total / cappedLimit) || 1,
      },
    };
  }

  async approveBatch(feedbackIds: string[], adminId: string) {
    const objectIds = feedbackIds.map((id) => new Types.ObjectId(id));
    const items = await this.feedbackModel
      .find({ _id: { $in: objectIds }, status: 'pending' })
      .exec();

    if (items.length === 0) {
      return { approved: 0 };
    }

    const now = new Date();
    await Promise.all(
      items.map(async (item) => {
        item.status = 'approved';
        item.reviewedBy = new Types.ObjectId(adminId);
        item.reviewedAt = now;
        item.rejectReason = undefined;
        await item.save();

        void this.notificationsService.createSafe({
          recipientId: item.authorId.toString(),
          type: 'feedback_approved',
          message: 'Sizning feedbackingiz tasdiqlandi va ekranda ko\'rinadi',
          link: '/feedback',
        });
      }),
    );

    this.emitFeedbackChange();
    return { approved: items.length };
  }

  async rejectBatch(
    feedbackIds: string[],
    adminId: string,
    reason?: string,
  ) {
    const objectIds = feedbackIds.map((id) => new Types.ObjectId(id));
    const items = await this.feedbackModel
      .find({
        _id: { $in: objectIds },
        status: { $in: ['pending', 'approved'] },
      })
      .exec();

    if (items.length === 0) {
      return { rejected: 0 };
    }

    const now = new Date();
    const trimmedReason = reason?.trim();

    await Promise.all(
      items.map(async (item) => {
        item.status = 'rejected';
        item.reviewedBy = new Types.ObjectId(adminId);
        item.reviewedAt = now;
        item.rejectReason = trimmedReason || undefined;
        await item.save();

        void this.notificationsService.createSafe({
          recipientId: item.authorId.toString(),
          type: 'feedback_rejected',
          message: trimmedReason
            ? `Feedbackingiz rad etildi: ${trimmedReason}`
            : 'Feedbackingiz rad etildi',
          link: '/feedback',
        });
      }),
    );

    this.emitFeedbackChange();
    return { rejected: items.length };
  }

  async deleteBatch(feedbackIds: string[]) {
    const objectIds = feedbackIds.map((id) => new Types.ObjectId(id));
    const result = await this.feedbackModel
      .deleteMany({ _id: { $in: objectIds } })
      .exec();

    this.emitFeedbackChange();
    return { deleted: result.deletedCount ?? 0 };
  }

  private toPublicFeedback(feedback: FeedbackDocument) {
    const json = feedback.toJSON() as Record<string, unknown>;
    const author = json.authorId as
      | {
          id?: string;
          _id?: { toString(): string };
          displayName?: string;
          username?: string;
          avatarUrl?: string;
          email?: string;
        }
      | undefined;

    if (author && typeof author === 'object') {
      json.author = {
        id: author.id ?? author._id?.toString(),
        displayName: author.displayName,
        username: author.username,
        avatarUrl: author.avatarUrl,
        email: author.email,
      };
    }

    delete json.authorId;
    delete json.reviewedBy;
    return json;
  }
}
