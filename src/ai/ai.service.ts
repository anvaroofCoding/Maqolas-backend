import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import {
  callGeminiContent,
  GEMINI_AUTOCOMPLETE_MODELS,
  hasGeminiApiKey,
  isGeminiQuotaError,
} from './gemini.util';

/** Kvota tugaganda qayta urinishdan oldin kutish (ms) */
const GEMINI_QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
/** Bir foydalanuvchi uchun autocomplete intervali (ms) */
const AUTOCOMPLETE_MIN_INTERVAL_MS = 1500;

export type AiCompleteResult = {
  suggestion: string;
  source: 'ai' | 'local';
  aiUnavailable?: boolean;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private geminiQuotaBlockedUntil = 0;
  private lastQuotaWarnAt = 0;
  private readonly lastCompleteAtByUser = new Map<string, number>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private isGeminiQuotaBlocked(): boolean {
    return Date.now() < this.geminiQuotaBlockedUntil;
  }

  private handleGeminiQuotaExceeded(context: 'autocomplete' | 'proofread'): void {
    this.geminiQuotaBlockedUntil = Date.now() + GEMINI_QUOTA_COOLDOWN_MS;

    const now = Date.now();
    if (now - this.lastQuotaWarnAt < 60_000) {
      return;
    }

    this.lastQuotaWarnAt = now;
    this.logger.warn(
      `AI ${context}: Gemini API kvota limiti tugagan. ${GEMINI_QUOTA_COOLDOWN_MS / 60_000} daqiqa davomida mahalliy taklif ishlatiladi. Google AI Studio (aistudio.google.com) da kvotani tekshiring.`,
    );
  }

  private logGeminiErrors(
    context: 'autocomplete' | 'proofread',
    errors: string[],
  ): void {
    if (isGeminiQuotaError(errors)) {
      this.handleGeminiQuotaExceeded(context);
      return;
    }

    this.logger.warn(`AI ${context} xatolari: ${errors.join(' | ')}`);
  }

  async complete(text: string, userId?: string): Promise<AiCompleteResult> {
    const fallback = this.localFallback(text);

    if (userId && this.isAutocompleteThrottled(userId)) {
      return { suggestion: fallback, source: 'local' };
    }

    if (this.isGeminiQuotaBlocked()) {
      return { suggestion: fallback, source: 'local', aiUnavailable: true };
    }

    const apiKey = this.config.get('geminiApiKey', { infer: true });
    if (!apiKey || !hasGeminiApiKey(apiKey)) {
      return { suggestion: fallback, source: 'local' };
    }

    if (userId) {
      this.lastCompleteAtByUser.set(userId, Date.now());
    }

    const suggestion = await this.completeWithGemini(apiKey, text);
    if (suggestion) {
      return { suggestion, source: 'ai' };
    }

    if (this.isGeminiQuotaBlocked()) {
      return { suggestion: fallback, source: 'local', aiUnavailable: true };
    }

    return { suggestion: fallback, source: 'local' };
  }

  private isAutocompleteThrottled(userId: string): boolean {
    const lastAt = this.lastCompleteAtByUser.get(userId);
    if (!lastAt) return false;
    return Date.now() - lastAt < AUTOCOMPLETE_MIN_INTERVAL_MS;
  }

  async proofread(text: string): Promise<{ text: string; source: 'ai' | 'local' }> {
    const trimmed = text.trim();
    if (!trimmed) {
      return { text: trimmed, source: 'local' };
    }

    const apiKey = this.config.get('geminiApiKey', { infer: true });
    if (apiKey && hasGeminiApiKey(apiKey) && !this.isGeminiQuotaBlocked()) {
      const corrected = await this.proofreadWithGemini(apiKey, trimmed);
      if (corrected) {
        return { text: corrected, source: 'ai' };
      }
    }

    return { text: trimmed, source: 'local' };
  }

  private async proofreadWithGemini(
    apiKey: string,
    text: string,
  ): Promise<string | null> {
    const prompt = [
      'Sen o\'zbek tilidagi imlo va grammatika muharririsisan.',
      'Berilgan matndagi xatolarni tuzat va faqat to\'g\'rilangan matnni qaytar.',
      'Ma\'no va uslubni saqla, ortiqcha izoh qo\'shmagan.',
      'Agar xato bo\'lmasa, matnni o\'zgartirmasdan qaytar.',
      '',
      `Matn:\n${text}`,
    ].join('\n');

    const result = await callGeminiContent(
      apiKey,
      {
        userMessage: prompt,
        maxOutputTokens: 1024,
        temperature: 0.2,
      },
      GEMINI_AUTOCOMPLETE_MODELS,
    );

    if (result.errors.length > 0) {
      this.logGeminiErrors('proofread', result.errors);
    }

    if (!result.text) {
      return null;
    }

    return result.text
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim()
      .slice(0, 4000);
  }

  private async completeWithGemini(
    apiKey: string,
    text: string,
  ): Promise<string | null> {
    const prompt = [
      'Sen o\'zbek tilida maqola yozish yordamchisisan.',
      'Foydalanuvchi yozayotgan matnning davomini qisqa va tabiiy tarzda taklif qil.',
      'Faqat keyingi 3-12 so\'zni qaytar, boshqa izoh bermagin.',
      'Agar matn tugallangan bo\'lsa, bo\'sh qator qaytar.',
      '',
      `Matn:\n${text}`,
    ].join('\n');

    const result = await callGeminiContent(
      apiKey,
      {
        userMessage: prompt,
        maxOutputTokens: 48,
        temperature: 0.65,
      },
      GEMINI_AUTOCOMPLETE_MODELS,
    );

    if (result.errors.length > 0) {
      this.logGeminiErrors('autocomplete', result.errors);
    }

    if (!result.text) {
      return null;
    }

    const suggestion = this.sanitizeSuggestion(result.text);
    return suggestion || null;
  }

  private sanitizeSuggestion(value: string): string {
    return value
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  private localFallback(text: string): string {
    const trimmed = text.trimEnd();
    const lastChar = trimmed.slice(-1);
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

    if (/[.!?…]$/.test(trimmed)) {
      const starters = [
        'Bundan tashqari, ',
        'Shu bilan birga, ',
        'Muhim jihat shundaki, ',
        'Keyingi bosqichda ',
        'Xulosa qilib aytganda, ',
      ];
      return starters[wordCount % starters.length];
    }

    if (lastChar === ',' || lastChar === ':') {
      return ' bu jarayon samaradorligini oshiradi';
    }

    const continuations = [
      ' muhim ahamiyatga ega',
      ' haqida batafsil',
      ' bo\'yicha fikr',
      ' natijasida',
      ' jarayonida',
      ' asosida',
      ' ko\'rsatkichlari',
      ' tajribasi',
    ];

    return continuations[wordCount % continuations.length];
  }
}
