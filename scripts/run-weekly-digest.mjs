/**
 * Haftalik digestni qo'lda ishga tushirish (test uchun).
 * Ishlatish: node scripts/run-weekly-digest.mjs
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { WeeklyDigestService } from '../dist/digest/weekly-digest.service.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn', 'log'],
});

try {
  const digest = app.get(WeeklyDigestService);
  const result = await digest.runWeeklyDigest();
  console.log('Natija:', result);
} finally {
  await app.close();
}
