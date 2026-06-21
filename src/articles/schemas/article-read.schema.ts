import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ArticleReadDocument = HydratedDocument<ArticleRead>;

@Schema({ timestamps: true })
export class ArticleRead {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Article', required: true, index: true })
  articleId!: Types.ObjectId;

  @Prop({ type: Number, default: 1, min: 1 })
  readCount!: number;

  @Prop({ type: Date, default: Date.now })
  lastReadAt!: Date;
}

export const ArticleReadSchema = SchemaFactory.createForClass(ArticleRead);
ArticleReadSchema.index({ userId: 1, articleId: 1 }, { unique: true });
ArticleReadSchema.index({ userId: 1, lastReadAt: -1 });
