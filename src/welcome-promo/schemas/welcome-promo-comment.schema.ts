import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WelcomePromoCommentDocument =
  HydratedDocument<WelcomePromoComment>;

export type WelcomePromoCommentStatus = 'pending' | 'approved' | 'rejected';

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
export class WelcomePromoComment {
  @Prop({
    type: Types.ObjectId,
    ref: 'WelcomePromo',
    required: true,
    index: true,
  })
  promoId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 2000 })
  content!: string;

  @Prop({ type: Types.ObjectId, ref: 'WelcomePromoComment', index: true })
  parentId?: Types.ObjectId;

  @Prop({ type: Number, default: 0, min: 0 })
  likeCount!: number;

  @Prop({ type: String })
  authorIp?: string;

  @Prop({
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  })
  status!: WelcomePromoCommentStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop({ type: String, maxlength: 500 })
  rejectReason?: string;
}

export const WelcomePromoCommentSchema =
  SchemaFactory.createForClass(WelcomePromoComment);
WelcomePromoCommentSchema.index({ promoId: 1, createdAt: -1 });
WelcomePromoCommentSchema.index({ promoId: 1, parentId: 1, createdAt: 1 });
WelcomePromoCommentSchema.index({ status: 1, createdAt: -1 });
