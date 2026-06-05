import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BannerDocument = HydratedDocument<Banner>;

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
export class Banner {
  @Prop({ type: String, trim: true, maxlength: 120 })
  title?: string;

  @Prop({ type: String, required: true, trim: true })
  imageUrl!: string;

  @Prop({ type: String, required: true, trim: true })
  linkUrl!: string;

  @Prop({ type: Boolean, default: true, index: true })
  isActive!: boolean;

  @Prop({ type: Number, default: 0, index: true })
  sortOrder!: number;
}

export const BannerSchema = SchemaFactory.createForClass(Banner);
BannerSchema.index({ isActive: 1, sortOrder: 1, createdAt: -1 });
