import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ArticleRequestLikeDocument = HydratedDocument<ArticleRequestLike>;

@Schema({ timestamps: true })
export class ArticleRequestLike {
  @Prop({ type: Types.ObjectId, ref: 'ArticleRequest', required: true, index: true })
  requestId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;
}

export const ArticleRequestLikeSchema =
  SchemaFactory.createForClass(ArticleRequestLike);
ArticleRequestLikeSchema.index({ requestId: 1, userId: 1 }, { unique: true });
