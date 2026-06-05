import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ArticleLikeDocument = HydratedDocument<ArticleLike>;

@Schema({ timestamps: true })
export class ArticleLike {
  @Prop({ type: Types.ObjectId, ref: 'Article', required: true, index: true })
  articleId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;
}

export const ArticleLikeSchema = SchemaFactory.createForClass(ArticleLike);
ArticleLikeSchema.index({ articleId: 1, userId: 1 }, { unique: true });
