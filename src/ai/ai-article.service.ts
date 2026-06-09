import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AppConfig } from '../config/configuration';
import { ArticlesService } from '../articles/articles.service';
import {
  AiArticleJob,
  AiArticleJobDocument,
} from './schemas/ai-article-job.schema';
import { buildArticleGenerationPrompt } from './prompts/article-generation.prompt';

const DAILY_LIMIT = 2;

const THINKING_PHASES = [
  'Talabingizni tahlil qilmoqda...',
  'Mavzu va asosiy g\'oyalarni ajratmoqda...',
  'Maqola tuzilmasini rejalashtirmoqda...',
  'Kirish qismini yozmoqda...',
  'Asosiy qismlarni shakllantirmoqda...',
  'Xulosa va yakuniy tahrir...',
];

@Injectable()
export class AiArticleService {
  constructor(
    @InjectModel(AiArticleJob.name)
    private readonly jobModel: Model<AiArticleJobDocument>,
    private readonly articlesService: ArticlesService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private startOfToday(): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private async countDailyUsage(userId: string): Promise<number> {
    return this.jobModel.countDocuments({
      userId,
      quotaConsumed: true,
      createdAt: { $gte: this.startOfToday() },
    });
  }

  async getQuota(userId: string) {
    const used = await this.countDailyUsage(userId);
    return {
      limit: DAILY_LIMIT,
      used,
      remaining: Math.max(0, DAILY_LIMIT - used),
    };
  }

  async startGeneration(userId: string, prompt: string) {
    const used = await this.countDailyUsage(userId);
    if (used >= DAILY_LIMIT) {
      throw new BadRequestException(
        'Kunlik AI maqola limiti tugadi. Ertaga qayta urinib ko\'ring.',
      );
    }

    const activeJob = await this.jobModel
      .findOne({
        userId,
        status: { $in: ['pending', 'processing'] },
      })
      .exec();

    if (activeJob) {
      throw new BadRequestException(
        'Hozircha boshqa AI maqola jarayoni davom etmoqda.',
      );
    }

    const job = await this.jobModel.create({
      userId,
      prompt: prompt.trim(),
      status: 'pending',
      thinkingSteps: [],
      currentStep: THINKING_PHASES[0],
      quotaConsumed: true,
    });

    void this.processJob(job.id);

    return { job: this.toPublicJob(job) };
  }

  async getJob(userId: string, jobId: string) {
    const job = await this.findUserJob(userId, jobId);
    return { job: this.toPublicJob(job) };
  }

  async getActiveJob(userId: string) {
    const job = await this.jobModel
      .findOne({
        userId,
        status: { $in: ['pending', 'processing'] },
      })
      .sort({ createdAt: -1 })
      .exec();

    return { job: job ? this.toPublicJob(job) : null };
  }

  async listArchive(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const filter = { userId, status: 'completed' as const };

    const [jobs, total] = await Promise.all([
      this.jobModel
        .find(filter)
        .sort({ completedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.jobModel.countDocuments(filter).exec(),
    ]);

    return {
      items: jobs.map((job) => this.toPublicJob(job)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private async findUserJob(userId: string, jobId: string) {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) {
      throw new NotFoundException('AI vazifa topilmadi');
    }
    if (job.userId.toString() !== userId) {
      throw new NotFoundException('AI vazifa topilmadi');
    }
    return job;
  }

  private toPublicJob(job: AiArticleJobDocument) {
    return {
      id: job.id,
      prompt: job.prompt,
      status: job.status,
      thinkingSteps: job.thinkingSteps,
      currentStep: job.currentStep ?? null,
      articleId: job.articleId ? String(job.articleId) : null,
      generatedTitle: job.generatedTitle ?? null,
      errorMessage: job.errorMessage ?? null,
      createdAt: job.createdAt,
      completedAt: job.completedAt ?? null,
    };
  }

  private async appendStep(jobId: string, step: string) {
    await this.jobModel.findByIdAndUpdate(jobId, {
      $push: { thinkingSteps: step },
      currentStep: step,
      status: 'processing',
    });
  }

  private async processJob(jobId: string) {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job || job.status === 'completed' || job.status === 'failed') {
      return;
    }

    try {
      await this.jobModel.findByIdAndUpdate(jobId, { status: 'processing' });

      for (let i = 0; i < THINKING_PHASES.length - 1; i++) {
        await this.delay(1200 + Math.random() * 800);
        const fresh = await this.jobModel.findById(jobId).exec();
        if (!fresh || fresh.status === 'failed') return;
        await this.appendStep(jobId, THINKING_PHASES[i]);
      }

      const generated = await this.generateArticleContent(job.prompt);

      await this.appendStep(jobId, THINKING_PHASES[THINKING_PHASES.length - 1]);
      await this.delay(600);

      const article = await this.articlesService.create(
        job.userId.toString(),
        {
          title: generated.title,
          contentHtml: generated.contentHtml,
          status: 'draft',
        },
      );

      await this.jobModel.findByIdAndUpdate(jobId, {
        status: 'completed',
        articleId: article._id,
        generatedTitle: generated.title,
        currentStep: 'Maqola tayyor!',
        $push: { thinkingSteps: 'Maqola tayyor!' },
        completedAt: new Date(),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Maqola yaratishda xatolik yuz berdi';

      await this.jobModel.findByIdAndUpdate(jobId, {
        status: 'failed',
        errorMessage: message,
        currentStep: 'Xatolik yuz berdi',
        completedAt: new Date(),
      });
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async generateArticleContent(prompt: string): Promise<{
    title: string;
    contentHtml: string;
  }> {
    const apiKey = this.config.get('geminiApiKey', { infer: true });

    if (apiKey?.startsWith('AIza')) {
      const result = await this.generateWithGemini(apiKey, prompt);
      if (result) return result;
    }

    return this.localFallbackArticle(prompt);
  }

  private async generateWithGemini(
    apiKey: string,
    prompt: string,
  ): Promise<{ title: string; contentHtml: string } | null> {
    const models = [
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ];

    const systemPrompt = buildArticleGenerationPrompt(prompt);

    for (const model of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt }] }],
              generationConfig: {
                temperature: 0.75,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
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
        const parsed = this.parseGeneratedJson(raw);
        if (parsed) return parsed;
      } catch {
        continue;
      }
    }

    return null;
  }

  private parseGeneratedJson(
    raw: string,
  ): { title: string; contentHtml: string } | null {
    try {
      const cleaned = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const data = JSON.parse(cleaned) as {
        title?: string;
        contentHtml?: string;
      };

      const title = data.title?.trim();
      const contentHtml = data.contentHtml?.trim();

      if (!title || !contentHtml) return null;
      if (contentHtml.length < 100) return null;

      return { title, contentHtml };
    } catch {
      return null;
    }
  }

  private localFallbackArticle(prompt: string): {
    title: string;
    contentHtml: string;
  } {
    const topic = prompt.slice(0, 80).trim() || 'Mavzuli maqola';
    const title = topic.charAt(0).toUpperCase() + topic.slice(1);

    const contentHtml = [
      `<h1>${this.escapeHtml(title)}</h1>`,
      `<p><strong>${this.escapeHtml(prompt.slice(0, 200))}</strong> — ushbu mavzu bo'yicha qisqa sharh va amaliy yo'riqnoma.</p>`,
      '<h2>Kirish</h2>',
      '<p>Bu mavzu zamonaviy jamiyatda katta ahamiyatga ega. Ushbu maqolada asosiy tushunchalar, amaliy maslahatlar va foydali xulosalar keltiriladi.</p>',
      '<div data-callout="true" data-variant="tip" class="article-callout article-callout--tip"><div class="article-callout__label" contenteditable="false">Maslahat</div><div class="article-callout__body"><p>Maqolani diqqat bilan o\'qing va har bir bo\'limni amalda sinab ko\'ring.</p></div></div>',
      '<h2>Asosiy qism</h2>',
      '<p>Mavzuni chuqurroq o\'rganish orqali ko\'p hollarda <mark data-color="#fef08a" style="background-color: #fef08a">samaraliroq yechimlar</mark> topish mumkin.</p>',
      '<h3>Amaliy qadamlar</h3>',
      '<ol>',
      '<li>Asosiy tushunchalarni tushunish</li>',
      '<li>Amaliy qadamlarni qo\'llash</li>',
      '<li>Natijalarni tahlil qilish</li>',
      '</ol>',
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Keyingi qadamni rejalashtirish</p></div></li></ul>',
      '<table><thead><tr><th>Bosqich</th><th>Natija</th></tr></thead><tbody><tr><td>Boshlang\'ich</td><td>Asosiy bilim</td></tr><tr><td>Rivojlantirish</td><td>Amaliy tajriba</td></tr></tbody></table>',
      '<blockquote><p>«Bilim — eng katta boylik.»</p></blockquote>',
      '<hr>',
      '<h2>Xulosa</h2>',
      '<p>Xulosa qilib aytganda, ushbu mavzu bo\'yicha bilim va tajriba muntazam rivojlantirilishi kerak.</p>',
    ].join('');

    return { title, contentHtml };
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
