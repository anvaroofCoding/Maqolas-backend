import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PinDocument = HydratedDocument<Pin>;

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
export class Pin {
  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  title!: string;

  @Prop({ type: String, trim: true, maxlength: 2000 })
  description?: string;

  @Prop({ type: String, required: true, trim: true, unique: true, index: true })
  slug!: string;

  @Prop({ type: String, required: true, trim: true })
  imageUrl!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId!: Types.ObjectId;

  @Prop({ type: Number, min: 0 })
  width?: number;

  @Prop({ type: Number, min: 0 })
  height?: number;

  @Prop({ type: String, default: '#6366f1', trim: true, maxlength: 20 })
  dominantColor?: string;

  @Prop({ type: Number, default: 0, min: 0 })
  viewCount!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  likeCount!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  commentCount!: number;

  @Prop({ type: Date, index: true })
  publishedAt?: Date;
}

export const PinSchema = SchemaFactory.createForClass(Pin);
PinSchema.index({ publishedAt: -1 });
PinSchema.index({ authorId: 1, publishedAt: -1 });
