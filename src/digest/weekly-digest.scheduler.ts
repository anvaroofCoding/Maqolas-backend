import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { AppConfig } from '../config/configuration';
import { WeeklyDigestService } from './weekly-digest.service';

@Injectable()
export class WeeklyDigestScheduler {
  private readonly logger = new Logger(WeeklyDigestScheduler.name);

  constructor(
    private readonly weeklyDigestService: WeeklyDigestService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Cron('0 10 * * 0', {
    name: 'weekly-digest',
    timeZone: 'Asia/Tashkent',
  })
  async handleWeeklyDigest() {
    const weeklyDigest = this.config.get('weeklyDigest', { infer: true });
    if (!weeklyDigest.enabled) {
      return;
    }

    this.logger.log('Haftalik digest rejalashtiruvchi ishga tushdi');
    await this.weeklyDigestService.runWeeklyDigest();
  }
}
