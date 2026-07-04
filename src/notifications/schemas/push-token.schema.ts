import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PushTokenDocument = HydratedDocument<PushToken>;

export const PUSH_PLATFORMS = ['ios', 'android', 'web'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

@Schema({ timestamps: true, collection: 'push_tokens' })
export class PushToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true })
  token!: string;

  @Prop({ required: true, enum: PUSH_PLATFORMS })
  platform!: PushPlatform;

  @Prop({ trim: true })
  deviceId?: string;
}

export const PushTokenSchema = SchemaFactory.createForClass(PushToken);

PushTokenSchema.index({ userId: 1, deviceId: 1 });
