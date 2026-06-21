import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CommentLikeDocument = HydratedDocument<CommentLike>;

@Schema({ timestamps: true })
export class CommentLike {
  @Prop({ type: Types.ObjectId, ref: 'Comment', required: true, index: true })
  commentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;
}

export const CommentLikeSchema = SchemaFactory.createForClass(CommentLike);
CommentLikeSchema.pre('validate', function normalizeUserId() {
  if (typeof this.userId === 'string' && Types.ObjectId.isValid(this.userId)) {
    this.userId = new Types.ObjectId(this.userId);
  }
});
CommentLikeSchema.index({ commentId: 1, userId: 1 }, { unique: true });
