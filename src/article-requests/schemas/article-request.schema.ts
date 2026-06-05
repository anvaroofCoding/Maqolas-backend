import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ArticleRequestDocument = HydratedDocument<ArticleRequest>;

export type ArticleRequestStatus = 'new' | 'in_progress' | 'fulfilled';

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
export class ArticleRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  authorId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  requesterId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  title!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 2000 })
  description!: string;

  @Prop({ type: String, trim: true, maxlength: 1000 })
  authorNote?: string;

  @Prop({
    type: String,
    enum: ['new', 'in_progress', 'fulfilled'],
    default: 'new',
    index: true,
  })
  status!: ArticleRequestStatus;

  @Prop({ type: Number, default: 0, min: 0 })
  likeCount!: number;
}

export const ArticleRequestSchema =
  SchemaFactory.createForClass(ArticleRequest);
ArticleRequestSchema.index({ authorId: 1, createdAt: -1 });
