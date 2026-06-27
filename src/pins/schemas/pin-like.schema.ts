import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PinLikeDocument = HydratedDocument<PinLike>;

@Schema({ timestamps: true })
export class PinLike {
  @Prop({ type: Types.ObjectId, ref: 'Pin', required: true, index: true })
  pinId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;
}

export const PinLikeSchema = SchemaFactory.createForClass(PinLike);
PinLikeSchema.index({ pinId: 1, userId: 1 }, { unique: true });
