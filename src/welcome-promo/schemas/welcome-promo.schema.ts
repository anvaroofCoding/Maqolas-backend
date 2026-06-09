import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WelcomePromoDocument = HydratedDocument<WelcomePromo>;

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
export class WelcomePromo {
  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  title!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 2000 })
  description!: string;

  @Prop({ type: String, required: true, trim: true })
  imageUrl!: string;

  @Prop({ type: String, trim: true, maxlength: 500 })
  linkUrl?: string;

  @Prop({ type: String, trim: true, maxlength: 100 })
  linkLabel?: string;

  @Prop({ type: Boolean, default: false, index: true })
  isActive!: boolean;

  @Prop({ type: Number, default: 0, min: 0 })
  commentCount!: number;
}

export const WelcomePromoSchema = SchemaFactory.createForClass(WelcomePromo);
WelcomePromoSchema.index({ isActive: 1, updatedAt: -1 });
