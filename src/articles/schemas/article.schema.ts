import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ArticleDocument = HydratedDocument<Article>;

export type ArticleStatus = 'draft' | 'review' | 'published' | 'rejected';

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
export class Article {
  @Prop({ type: String, required: true, trim: true, default: 'Nomsiz maqola' })
  title!: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  slug!: string;

  @Prop({ type: String, default: '' })
  contentHtml!: string;

  @Prop({ type: Object })
  contentJson?: Record<string, unknown>;

  @Prop({
    type: String,
    enum: ['draft', 'review', 'published', 'rejected'],
    default: 'draft',
  })
  status!: ArticleStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId!: Types.ObjectId;

  @Prop({ type: String, trim: true })
  excerpt?: string;

  @Prop({ type: String, trim: true })
  coverImageUrl?: string;

  @Prop({ type: Number, default: 0, min: 0 })
  viewCount!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  likeCount!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  commentCount!: number;

  @Prop({ type: Boolean, default: false, index: true })
  isPinned!: boolean;

  @Prop({ type: String, trim: true })
  reviewNote?: string;

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop({ type: Date })
  submittedAt?: Date;

  @Prop({ type: Date, index: true })
  publishedAt?: Date;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Category' }], default: [], index: true })
  categoryIds!: Types.ObjectId[];

  @Prop({ type: [String], default: [], index: true })
  hashtags!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const ArticleSchema = SchemaFactory.createForClass(Article);
