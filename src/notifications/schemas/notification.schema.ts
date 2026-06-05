import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

export const NOTIFICATION_TYPES = [
  'article_liked',
  'article_commented',
  'comment_replied',
  'user_followed',
  'article_approved',
  'article_rejected',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  recipientId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  actorId?: Types.ObjectId;

  @Prop({ type: String, enum: NOTIFICATION_TYPES, required: true })
  type!: NotificationType;

  @Prop({ type: String, required: true })
  message!: string;

  @Prop({ type: String })
  link?: string;

  @Prop({ type: Types.ObjectId, ref: 'Article' })
  articleId?: Types.ObjectId;

  @Prop({ type: Boolean, default: false, index: true })
  isRead!: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ recipientId: 1, createdAt: -1 });
