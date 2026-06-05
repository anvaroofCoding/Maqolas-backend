import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ArticleBookmarkDocument = HydratedDocument<ArticleBookmark>;

@Schema({ timestamps: true })
export class ArticleBookmark {
  @Prop({ type: Types.ObjectId, ref: 'Article', required: true, index: true })
  articleId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;
}

export const ArticleBookmarkSchema =
  SchemaFactory.createForClass(ArticleBookmark);
ArticleBookmarkSchema.index({ articleId: 1, userId: 1 }, { unique: true });
ArticleBookmarkSchema.index({ userId: 1, createdAt: -1 });
