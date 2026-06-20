import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import {
  callGeminiContent,
  GEMINI_AUTOCOMPLETE_MODELS,
  hasGeminiApiKey,
} from './gemini.util';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async complete(text: string): Promise<{ suggestion: string; source: 'ai' | 'local' }> {
    const apiKey = this.config.get('geminiApiKey', { infer: true });
    if (apiKey && hasGeminiApiKey(apiKey)) {
      const suggestion = await this.completeWithGemini(apiKey, text);
      if (suggestion) {
        return { suggestion, source: 'ai' };
      }
    }

    return { suggestion: this.localFallback(text), source: 'local' };
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
      this.logger.warn(
        `AI autocomplete xatolari: ${result.errors.join(' | ')}`,
      );
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
