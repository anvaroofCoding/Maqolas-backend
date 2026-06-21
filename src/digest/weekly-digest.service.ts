import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ArticlesService } from '../articles/articles.service';
import type { AppConfig } from '../config/configuration';
import { EmailService } from '../email/email.service';
import { User, UserDocument } from '../users/schemas/user.schema';

const USER_BATCH_DELAY_MS = 300;

@Injectable()
export class WeeklyDigestService {
  private readonly logger = new Logger(WeeklyDigestService.name);
  private running = false;

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly articlesService: ArticlesService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async runWeeklyDigest() {
    if (this.running) {
      this.logger.warn('Haftalik digest allaqachon ishlayapti');
      return { sent: 0, skipped: 0, failed: 0 };
    }

    const weeklyDigest = this.config.get('weeklyDigest', { infer: true });
    const email = this.config.get('email', { infer: true });

    if (!weeklyDigest.enabled) {
      this.logger.log('Haftalik digest o\'chirilgan');
      return { sent: 0, skipped: 0, failed: 0 };
    }

    if (!email.enabled) {
      this.logger.warn('Haftalik digest: SMTP sozlanmagan');
      return { sent: 0, skipped: 0, failed: 0 };
    }

    this.running = true;
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const cutoff = new Date(
        Date.now() - weeklyDigest.minDaysBetween * 24 * 60 * 60 * 1000,
      );

      const users = await this.userModel
        .find({
          email: { $exists: true, $ne: '' },
          $or: [
            { lastWeeklyDigestAt: { $exists: false } },
            { lastWeeklyDigestAt: null },
            { lastWeeklyDigestAt: { $lte: cutoff } },
          ],
        })
        .select('email displayName')
        .lean()
        .exec();

      this.logger.log(`Haftalik digest boshlandi: ${users.length} ta foydalanuvchi`);

      for (const user of users) {
        const userId = String(user._id);
        const recommendations =
          await this.articlesService.getWeeklyRecommendationsForUser(userId);

        if (!recommendations || recommendations.articles.length === 0) {
          skipped++;
          continue;
        }

        const delivered = await this.emailService.sendWeeklyDigestEmail(
          {
            email: user.email,
            displayName: user.displayName,
          },
          recommendations,
        );

        if (delivered) {
          await this.userModel.updateOne(
            { _id: user._id },
            { $set: { lastWeeklyDigestAt: new Date() } },
          );
          sent++;
        } else {
          failed++;
        }

        await this.delay(USER_BATCH_DELAY_MS);
      }

      this.logger.log(
        `Haftalik digest tugadi: ${sent} yuborildi, ${skipped} o'tkazib yuborildi, ${failed} xato`,
      );

      return { sent, skipped, failed };
    } finally {
      this.running = false;
    }
  }
}
