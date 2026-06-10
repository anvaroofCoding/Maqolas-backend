import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

@Injectable()
export class AiService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async complete(text: string): Promise<{ suggestion: string }> {
    const apiKey = this.config.get('geminiApiKey', { infer: true });
    if (apiKey) {
      const suggestion = await this.completeWithGemini(apiKey, text);
      if (suggestion) {
        return { suggestion };
      }
    }

    return { suggestion: this.localFallback(text) };
  }

  private async completeWithGemini(
    apiKey: string,
    text: string,
  ): Promise<string | null> {
    if (!apiKey?.trim()) {
      return null;
    }

    const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
    const prompt = [
      'Sen o\'zbek tilida maqola yozish yordamchisisan.',
      'Foydalanuvchi yozayotgan matnning davomini qisqa va tabiiy tarzda taklif qil.',
      'Faqat keyingi 3-12 so\'zni qaytar, boshqa izoh bermagin.',
      'Agar matn tugallangan bo\'lsa, bo\'sh qator qaytar.',
      '',
      `Matn:\n${text}`,
    ].join('\n');

    for (const model of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.65,
                maxOutputTokens: 48,
              },
            }),
          },
        );

        if (!response.ok) continue;

        const payload = (await response.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };

        const raw =
          payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
        const suggestion = this.sanitizeSuggestion(raw);
        if (suggestion) return suggestion;
      } catch {
        continue;
      }
    }

    return null;
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
