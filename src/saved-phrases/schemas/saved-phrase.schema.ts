import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SavedPhraseDocument = HydratedDocument<SavedPhrase>;

@Schema({ timestamps: true })
export class SavedPhrase {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Article', required: true, index: true })
  articleId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 1000 })
  text!: string;

  @Prop({ required: true, trim: true })
  articleSlug!: string;

  @Prop({ required: true, trim: true })
  articleTitle!: string;
}

export const SavedPhraseSchema = SchemaFactory.createForClass(SavedPhrase);
SavedPhraseSchema.index({ userId: 1, createdAt: -1 });
SavedPhraseSchema.index(
  { userId: 1, articleId: 1, text: 1 },
  { unique: true },
);
