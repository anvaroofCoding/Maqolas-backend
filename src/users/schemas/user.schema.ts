import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.refreshTokenHash;
      return ret;
    },
  },
})
export class User {
  @Prop({ required: true, unique: true, index: true })
  googleId!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, trim: true })
  displayName!: string;

  @Prop({ trim: true })
  firstName?: string;

  @Prop({ trim: true })
  lastName?: string;

  @Prop()
  avatarUrl?: string;

  @Prop({ select: false })
  refreshTokenHash?: string;

  @Prop({ default: 'google' })
  provider!: string;

  @Prop({ default: Date.now })
  lastLoginAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
