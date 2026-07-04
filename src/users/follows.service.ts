import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ListFollowersDto } from './dto/list-followers.dto';
import {
  UserFollow,
  UserFollowDocument,
} from './schemas/user-follow.schema';
import { User, UserDocument } from './schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { rtTags } from '../realtime/realtime-tags';
import { UsersService } from './users.service';

@Injectable()
export class FollowsService {
  constructor(
    @InjectModel(UserFollow.name)
    private readonly followModel: Model<UserFollowDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  private toObjectId(id: string | Types.ObjectId) {
    return typeof id === 'string' ? new Types.ObjectId(id) : id;
  }

  async countFollowers(userId: string) {
    const followerIds = await this.followModel
      .distinct('followerId', { followingId: this.toObjectId(userId) })
      .exec();
    return followerIds.length;
  }

  async countFollowing(userId: string) {
    return this.followModel
      .countDocuments({ followerId: this.toObjectId(userId) })
      .exec();
  }

  async isFollowing(followerId: string, followingId: string) {
    const existing = await this.followModel
      .exists({
        followerId: this.toObjectId(followerId),
        followingId: this.toObjectId(followingId),
      })
      .exec();
    return Boolean(existing);
  }

  async toggleFollow(followerId: string, username: string) {
    const target = await this.usersService.findByUsername(username);
    if (!target) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const followerObjectId = this.toObjectId(followerId);
    const followingObjectId = this.toObjectId(target.id);

    if (target.id === followerId) {
      throw new ForbiddenException('O\'zingizga obuna bo\'la olmaysiz');
    }

    const existing = await this.followModel
      .findOne({ followerId: followerObjectId, followingId: followingObjectId })
      .exec();

    if (existing) {
      await existing.deleteOne();
      const followersCount = await this.countFollowers(target.id);
      this.realtime.invalidate([
        ...rtTags.userProfile(username),
        ...rtTags.userFollowers(username),
      ]);
      return { following: false, followersCount };
    }

    await this.followModel.create({
      followerId: followerObjectId,
      followingId: followingObjectId,
    });

    const follower = await this.userModel
      .findById(followerId)
      .select('displayName username')
      .lean()
      .exec();
    const actorName =
      follower?.displayName ?? follower?.username ?? 'Kimdir';
    const followerUsername = follower?.username;

    void this.notificationsService.createSafe({
      recipientId: target.id,
      actorId: followerId,
      type: 'user_followed',
      message: `${actorName} sizga obuna bo'ldi`,
      link: followerUsername ? `/profil/${followerUsername}` : undefined,
    });

    const followersCount = await this.countFollowers(target.id);

    this.realtime.invalidate([
      ...rtTags.userProfile(username),
      ...rtTags.userFollowers(username),
    ]);

    return { following: true, followersCount };
  }

  async getFollowers(username: string, query: ListFollowersDto) {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const followingObjectId = this.toObjectId(user.id);

    const [follows, total] = await Promise.all([
      this.followModel
        .find({ followingId: followingObjectId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('followerId', 'displayName username avatarUrl bio')
        .exec(),
      this.countFollowers(user.id),
    ]);

    const seenFollowerIds = new Set<string>();
    const followers = follows
      .map((follow) => {
        const follower = follow.followerId as unknown as UserDocument;
        return this.usersService.toPublicProfile(follower);
      })
      .filter((follower): follower is NonNullable<typeof follower> => {
        if (!follower) return false;
        const followerId = String(follower.id ?? '');
        if (!followerId || seenFollowerIds.has(followerId)) return false;
        seenFollowerIds.add(followerId);
        return true;
      });

    return {
      followers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getFollowing(username: string, query: ListFollowersDto) {
    const user = await this.usersService.findByUsername(username);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const followerObjectId = this.toObjectId(user.id);

    const [follows, total] = await Promise.all([
      this.followModel
        .find({ followerId: followerObjectId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('followingId', 'displayName username avatarUrl bio')
        .exec(),
      this.countFollowing(user.id),
    ]);

    const seenFollowingIds = new Set<string>();
    const following = follows
      .map((follow) => {
        const target = follow.followingId as unknown as UserDocument;
        return this.usersService.toPublicProfile(target);
      })
      .filter((target): target is NonNullable<typeof target> => {
        if (!target) return false;
        const targetId = String(target.id ?? '');
        if (!targetId || seenFollowingIds.has(targetId)) return false;
        seenFollowingIds.add(targetId);
        return true;
      });

    return {
      following,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
