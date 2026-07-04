import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RealtimeService } from '../realtime/realtime.service';
import { rtTags } from '../realtime/realtime-tags';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { PushNotificationsService } from './push-notifications.service';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';

type CreateNotificationInput = {
  recipientId: string;
  actorId?: string;
  type: NotificationType;
  message: string;
  link?: string;
  articleId?: string;
};

type NotifyAdminsInput = Omit<CreateNotificationInput, 'recipientId'>;

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly realtime: RealtimeService,
    private readonly pushNotifications: PushNotificationsService,
  ) {}

  async create(input: CreateNotificationInput) {
    if (
      input.actorId &&
      input.recipientId === input.actorId &&
      input.type !== 'article_approved' &&
      input.type !== 'article_rejected'
    ) {
      return null;
    }

    const notification = await this.notificationModel.create({
      recipientId: new Types.ObjectId(input.recipientId),
      actorId: input.actorId
        ? new Types.ObjectId(input.actorId)
        : undefined,
      type: input.type,
      message: input.message,
      link: input.link,
      articleId: input.articleId
        ? new Types.ObjectId(input.articleId)
        : undefined,
    });

    this.realtime.invalidate(rtTags.notifications(), {
      userId: input.recipientId,
    });

    void this.pushNotifications.sendToUser(input.recipientId, {
      body: input.message,
      data: {
        notificationId: notification.id,
        type: input.type,
        ...(input.link ? { link: input.link } : {}),
      },
    });

    return notification;
  }

  async createSafe(input: CreateNotificationInput) {
    try {
      return await this.create(input);
    } catch {
      return null;
    }
  }

  async notifyAdmins(input: NotifyAdminsInput) {
    try {
      const admins = await this.userModel
        .find({ role: 'super_admin' })
        .select('_id')
        .lean()
        .exec();

      if (admins.length === 0) {
        return;
      }

      await Promise.all(
        admins.map((admin) => {
          const recipientId = String(admin._id);
          if (input.actorId && input.actorId === recipientId) {
            return Promise.resolve(null);
          }

          return this.createSafe({
            ...input,
            recipientId,
          });
        }),
      );

      this.realtime.invalidate(rtTags.notifications(), { admin: true });
    } catch {
      // Admin bildirishnomalari ixtiyoriy — asosiy jarayonni to'xtatmaydi
    }
  }

  async listForUser(userId: string, query: ListNotificationsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 15;
    const skip = (page - 1) * limit;
    const filter = { recipientId: new Types.ObjectId(userId) };

    const [notifications, total] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actorId', 'displayName username avatarUrl')
        .exec(),
      this.notificationModel.countDocuments(filter).exec(),
    ]);

    return {
      notifications: notifications.map((item) => this.toPublicNotification(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getUnreadCount(userId: string) {
    const count = await this.notificationModel
      .countDocuments({
        recipientId: new Types.ObjectId(userId),
        isRead: false,
      })
      .exec();

    return { count };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.notificationModel.findById(id).exec();

    if (!notification) {
      throw new NotFoundException('Bildirishnoma topilmadi');
    }

    if (notification.recipientId.toString() !== userId) {
      throw new NotFoundException('Bildirishnoma topilmadi');
    }

    notification.isRead = true;
    await notification.save();

    return { notification: this.toPublicNotification(notification) };
  }

  async markAllAsRead(userId: string) {
    await this.notificationModel
      .updateMany(
        { recipientId: new Types.ObjectId(userId), isRead: false },
        { $set: { isRead: true } },
      )
      .exec();

    return { success: true };
  }

  private toPublicNotification(notification: NotificationDocument) {
    const json = notification.toJSON() as Record<string, unknown>;
    const actor = json.actorId as
      | {
          id?: string;
          _id?: { toString(): string };
          displayName?: string;
          username?: string;
          avatarUrl?: string;
        }
      | undefined;

    if (actor && typeof actor === 'object') {
      json.actor = {
        id: actor.id ?? actor._id?.toString(),
        displayName: actor.displayName,
        username: actor.username,
        avatarUrl: actor.avatarUrl,
      };
    }

    delete json.actorId;

    if (json.articleId) {
      json.articleId = String(json.articleId);
    }

    return json;
  }
}
