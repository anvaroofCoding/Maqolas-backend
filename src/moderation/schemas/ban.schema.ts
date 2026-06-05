import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BanDocument = HydratedDocument<Ban>;

export const BAN_UNITS = ['hours', 'days', 'months', 'permanent'] as const;
export type BanUnit = (typeof BAN_UNITS)[number];

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
export class Ban {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  targetUserId?: Types.ObjectId;

  @Prop({ type: String, index: true })
  ipAddress?: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 500 })
  reason!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  bannedBy!: Types.ObjectId;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ type: Boolean, default: false })
  isPermanent!: boolean;

  @Prop({ type: Boolean, default: true, index: true })
  isActive!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'CommentReport' })
  sourceReportId?: Types.ObjectId;

  @Prop({ type: Number })
  durationAmount?: number;

  @Prop({ type: String, enum: BAN_UNITS })
  durationUnit?: BanUnit;
}

export const BanSchema = SchemaFactory.createForClass(Ban);
BanSchema.index({ targetUserId: 1, isActive: 1 });
BanSchema.index({ ipAddress: 1, isActive: 1 });
