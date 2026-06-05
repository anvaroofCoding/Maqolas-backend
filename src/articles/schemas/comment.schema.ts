import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CommentDocument = HydratedDocument<Comment>;

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
export class Comment {
  @Prop({ type: Types.ObjectId, ref: 'Article', required: true, index: true })
  articleId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 2000 })
  content!: string;

  @Prop({ type: Types.ObjectId, ref: 'Comment', index: true })
  parentId?: Types.ObjectId;

  @Prop({ type: Number, default: 0, min: 0 })
  likeCount!: number;

  @Prop({ type: String })
  authorIp?: string;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
CommentSchema.index({ articleId: 1, createdAt: -1 });
CommentSchema.index({ articleId: 1, parentId: 1, createdAt: 1 });
CommentSchema.index({ likeCount: -1, createdAt: -1 });
