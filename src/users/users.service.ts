import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

export interface GoogleProfilePayload {
  googleId: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  findByGoogleId(googleId: string) {
    return this.userModel.findOne({ googleId }).exec();
  }

  async upsertFromGoogle(profile: GoogleProfilePayload) {
    return this.userModel
      .findOneAndUpdate(
        { googleId: profile.googleId },
        {
          $set: {
            email: profile.email,
            displayName: profile.displayName,
            firstName: profile.firstName,
            lastName: profile.lastName,
            avatarUrl: profile.avatarUrl,
            lastLoginAt: new Date(),
          },
          $setOnInsert: {
            googleId: profile.googleId,
            provider: 'google',
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  async setRefreshTokenHash(userId: string, hash: string | null) {
    return this.userModel
      .findByIdAndUpdate(userId, { refreshTokenHash: hash })
      .exec();
  }

  findByIdWithRefreshHash(id: string) {
    return this.userModel.findById(id).select('+refreshTokenHash').exec();
  }
}
