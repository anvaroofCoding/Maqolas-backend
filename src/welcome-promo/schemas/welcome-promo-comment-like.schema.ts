import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WelcomePromoCommentLikeDocument =
  HydratedDocument<WelcomePromoCommentLike>;

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
export class WelcomePromoCommentLike {
  @Prop({
    type: Types.ObjectId,
    ref: 'WelcomePromoComment',
    required: true,
    index: true,
  })
  commentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;
}

export const WelcomePromoCommentLikeSchema = SchemaFactory.createForClass(
  WelcomePromoCommentLike,
);
WelcomePromoCommentLikeSchema.index(
  { commentId: 1, userId: 1 },
  { unique: true },
);
