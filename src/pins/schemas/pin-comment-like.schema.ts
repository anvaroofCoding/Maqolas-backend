import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PinCommentLikeDocument = HydratedDocument<PinCommentLike>;

@Schema({ timestamps: true })
export class PinCommentLike {
  @Prop({ type: Types.ObjectId, ref: 'PinComment', required: true, index: true })
  commentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;
}

export const PinCommentLikeSchema =
  SchemaFactory.createForClass(PinCommentLike);
PinCommentLikeSchema.index({ commentId: 1, userId: 1 }, { unique: true });
