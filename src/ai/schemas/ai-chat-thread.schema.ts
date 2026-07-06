import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AiChatThreadDocument = HydratedDocument<AiChatThreadRecord>;

export type AiChatThreadMode = 'chat' | 'article';

@Schema({
  timestamps: true,
  toJSON: {
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class AiChatThreadRecord {
  @Prop({ type: String, required: true, index: true })
  userId!: string;

  @Prop({ type: String, default: 'Yangi suhbat', trim: true, maxlength: 120 })
  title!: string;

  @Prop({ type: String, enum: ['chat', 'article'], default: 'chat' })
  mode!: AiChatThreadMode;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AiChatThreadRecordSchema =
  SchemaFactory.createForClass(AiChatThreadRecord);

AiChatThreadRecordSchema.index({ userId: 1, createdAt: -1 });
