import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateChatThreadDto } from './dto/create-chat-thread.dto';
import {
  AiChatThreadRecord,
  AiChatThreadDocument,
} from './schemas/ai-chat-thread.schema';

export const DEFAULT_AI_CHAT_DAILY_LIMIT = 2;

@Injectable()
export class AiChatService {
  constructor(
    @InjectModel(AiChatThreadRecord.name)
    private readonly threadModel: Model<AiChatThreadDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  private startOfToday(): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private resolveDailyLimit(user: Pick<User, 'aiChatDailyLimit'>): number {
    if (
      typeof user.aiChatDailyLimit === 'number' &&
      Number.isFinite(user.aiChatDailyLimit)
    ) {
      return user.aiChatDailyLimit;
    }

    return DEFAULT_AI_CHAT_DAILY_LIMIT;
  }

  private async countDailyThreads(userId: string): Promise<number> {
    return this.threadModel.countDocuments({
      userId,
      createdAt: { $gte: this.startOfToday() },
    });
  }

  async getQuota(userId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const limit = this.resolveDailyLimit(user);
    const used = await this.countDailyThreads(userId);

    return {
      limit,
      used,
      remaining: Math.max(0, limit - used),
    };
  }

  async createThread(userId: string, dto: CreateChatThreadDto) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const limit = this.resolveDailyLimit(user);
    const used = await this.countDailyThreads(userId);

    if (used >= limit) {
      throw new BadRequestException('Bugungi limit tugadi.');
    }

    const thread = await this.threadModel.create({
      userId,
      title: dto.title?.trim() || 'Yangi suhbat',
      mode: dto.mode ?? 'chat',
    });

    const nextUsed = used + 1;

    return {
      thread: {
        id: thread.id,
        title: thread.title,
        mode: thread.mode,
        createdAt:
          thread.createdAt instanceof Date
            ? thread.createdAt.toISOString()
            : new Date().toISOString(),
      },
      quota: {
        limit,
        used: nextUsed,
        remaining: Math.max(0, limit - nextUsed),
      },
    };
  }

  async updateUserDailyLimit(userId: string, aiChatDailyLimit: number) {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { aiChatDailyLimit }, { new: true })
      .select('displayName username email aiChatDailyLimit role')
      .exec();

    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const quota = await this.getQuota(userId);

    return {
      user: user.toJSON(),
      quota,
    };
  }
}
