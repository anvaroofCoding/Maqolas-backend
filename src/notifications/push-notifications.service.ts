import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import {
  PushToken,
  PushTokenDocument,
} from './schemas/push-token.schema';

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
};

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(
    @InjectModel(PushToken.name)
    private readonly pushTokenModel: Model<PushTokenDocument>,
  ) {}

  async registerToken(userId: string, input: RegisterPushTokenDto) {
    const userObjectId = new Types.ObjectId(userId);

    await this.pushTokenModel
      .findOneAndUpdate(
        { token: input.token },
        {
          userId: userObjectId,
          token: input.token,
          platform: input.platform,
          deviceId: input.deviceId,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    if (input.deviceId) {
      await this.pushTokenModel
        .deleteMany({
          userId: userObjectId,
          deviceId: input.deviceId,
          token: { $ne: input.token },
        })
        .exec();
    }

    return { success: true };
  }

  async removeToken(userId: string, token: string) {
    await this.pushTokenModel
      .deleteOne({
        userId: new Types.ObjectId(userId),
        token,
      })
      .exec();

    return { success: true };
  }

  async removeAllTokensForUser(userId: string) {
    await this.pushTokenModel
      .deleteMany({ userId: new Types.ObjectId(userId) })
      .exec();

    return { success: true };
  }

  async sendToUser(
    userId: string,
    payload: {
      title?: string;
      body: string;
      data?: Record<string, string>;
    },
  ) {
    const tokens = await this.pushTokenModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('token')
      .lean()
      .exec();

    if (tokens.length === 0) {
      return;
    }

    const messages: ExpoPushMessage[] = tokens.map((entry) => ({
      to: entry.token,
      title: payload.title ?? 'Maqolas',
      body: payload.body,
      data: payload.data,
      sound: 'default',
      priority: 'high',
      channelId: 'maqolas-default',
    }));

    await this.sendExpoPushMessages(messages);
  }

  private async sendExpoPushMessages(messages: ExpoPushMessage[]) {
    const chunks = this.chunk(messages, 100);

    for (const chunk of chunks) {
      try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        });

        if (!response.ok) {
          this.logger.warn(
            `Expo push HTTP ${response.status}: ${await response.text()}`,
          );
          continue;
        }

        const result = (await response.json()) as { data?: ExpoPushTicket[] };
        const tickets = result.data ?? [];

        for (const ticket of tickets) {
          if (ticket.status === 'error') {
            const errorCode = ticket.details?.error;
            this.logger.warn(
              `Expo push ticket error: ${ticket.message ?? errorCode ?? 'unknown'}`,
            );

            if (
              errorCode === 'DeviceNotRegistered' ||
              errorCode === 'InvalidCredentials'
            ) {
              const index = tickets.indexOf(ticket);
              const token = chunk[index]?.to;
              if (token) {
                await this.pushTokenModel.deleteOne({ token }).exec();
              }
            }
          }
        }
      } catch (error) {
        this.logger.warn(
          `Expo push yuborishda xatolik: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      result.push(items.slice(index, index + size));
    }
    return result;
  }
}
