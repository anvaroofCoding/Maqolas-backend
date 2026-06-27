import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PinCommentDocument = HydratedDocument<PinComment>;

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
export class PinComment {
  @Prop({ type: Types.ObjectId, ref: 'Pin', required: true, index: true })
  pinId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 2000 })
  content!: string;

  @Prop({ type: Types.ObjectId, ref: 'PinComment', index: true })
  parentId?: Types.ObjectId;

  @Prop({ type: Number, default: 0, min: 0 })
  likeCount!: number;

  @Prop({ type: String })
  authorIp?: string;
}

export const PinCommentSchema = SchemaFactory.createForClass(PinComment);
PinCommentSchema.index({ pinId: 1, createdAt: -1 });
PinCommentSchema.index({ pinId: 1, parentId: 1, createdAt: 1 });
