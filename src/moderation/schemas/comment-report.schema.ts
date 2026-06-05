import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CommentReportDocument = HydratedDocument<CommentReport>;

export const COMMENT_REPORT_STATUSES = ['pending', 'reviewed', 'dismissed'] as const;
export type CommentReportStatus = (typeof COMMENT_REPORT_STATUSES)[number];

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
export class CommentReport {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reporterId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Comment', required: true, index: true })
  commentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Article', required: true })
  articleId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reportedUserId!: Types.ObjectId;

  @Prop({ type: String, trim: true, maxlength: 500 })
  reason?: string;

  @Prop({ type: String, required: true })
  reporterIp!: string;

  @Prop({ type: String })
  reportedUserIp?: string;

  @Prop({
    type: String,
    enum: COMMENT_REPORT_STATUSES,
    default: 'pending',
    index: true,
  })
  status!: CommentReportStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop({ type: Date })
  reviewedAt?: Date;
}

export const CommentReportSchema = SchemaFactory.createForClass(CommentReport);
CommentReportSchema.index({ commentId: 1, reporterId: 1 }, { unique: true });
