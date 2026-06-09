import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AiArticleJobDocument = HydratedDocument<AiArticleJob>;

export type AiArticleJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

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
export class AiArticleJob {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 15000 })
  prompt!: string;

  @Prop({
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true,
  })
  status!: AiArticleJobStatus;

  @Prop({ type: [String], default: [] })
  thinkingSteps!: string[];

  @Prop({ type: String, trim: true })
  currentStep?: string;

  @Prop({ type: Types.ObjectId, ref: 'Article' })
  articleId?: Types.ObjectId;

  @Prop({ type: String, trim: true })
  generatedTitle?: string;

  @Prop({ type: String, trim: true })
  errorMessage?: string;

  @Prop({ type: Boolean, default: true })
  quotaConsumed!: boolean;

  @Prop({ type: Date })
  completedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AiArticleJobSchema = SchemaFactory.createForClass(AiArticleJob);

AiArticleJobSchema.index({ userId: 1, createdAt: -1 });
AiArticleJobSchema.index({ userId: 1, status: 1 });
