import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

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
export class Category {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: true, unique: true, index: true, trim: true })
  slug!: string;

  @Prop({ type: Number, default: 0 })
  sortOrder!: number;

  @Prop({ type: Boolean, default: true, index: true })
  isActive!: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
