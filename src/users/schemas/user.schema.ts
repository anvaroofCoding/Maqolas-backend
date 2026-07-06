import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export type UserRole = 'user' | 'super_admin';

@Schema({ _id: false })
export class UserSocialLinks {
  @Prop({ type: String, trim: true })
  website?: string;

  @Prop({ type: String, trim: true })
  linkedin?: string;

  @Prop({ type: String, trim: true })
  telegram?: string;

  @Prop({ type: String, trim: true })
  instagram?: string;
}

export const UserSocialLinksSchema =
  SchemaFactory.createForClass(UserSocialLinks);

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.__v;
      delete ret.refreshTokenHash;
      return ret;
    },
  },
})
export class User {
  @Prop({ type: String, required: true, unique: true, index: true })
  googleId!: string;

  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  username!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 20 })
  displayName!: string;

  @Prop({ type: Boolean, default: false })
  displayNameEdited!: boolean;

  @Prop({ type: String, trim: true, maxlength: 100 })
  bio?: string;

  @Prop({ type: String, trim: true })
  firstName?: string;

  @Prop({ type: String, trim: true })
  lastName?: string;

  @Prop({ type: String })
  avatarUrl?: string;

  @Prop({ type: Boolean, default: false })
  avatarEdited!: boolean;

  @Prop({ type: UserSocialLinksSchema, default: {} })
  social!: UserSocialLinks;

  @Prop({ type: String, select: false })
  refreshTokenHash?: string;

  @Prop({ type: String, default: 'google' })
  provider!: string;

  @Prop({ type: Date, default: Date.now })
  lastLoginAt!: Date;

  @Prop({
    type: String,
    enum: ['user', 'super_admin'],
    default: 'user',
    index: true,
  })
  role!: UserRole;

  @Prop({ type: Date })
  lastWeeklyDigestAt?: Date;

  /** Kunlik AI suhbat yaratish limiti (standart: 2). Admin belgilaydi. */
  @Prop({ type: Number, min: 0, max: 100 })
  aiChatDailyLimit?: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
