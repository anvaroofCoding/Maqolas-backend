import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AppConfig } from '../config/configuration';
import { ArticlesService } from '../articles/articles.service';
import { RealtimeService } from '../realtime/realtime.service';
import { rtTags } from '../realtime/realtime-tags';
import {
  callGeminiContent,
  GEMINI_GENERATION_MODELS,
  hasGeminiApiKey,
  isTemplateGarbage,
  parseArticleGenerationPayload,
  parseSectionGenerationPayload,
  pickGeminiErrorMessage,
} from './gemini.util';
import {
  AiArticleJob,
  AiArticleJobDocument,
} from './schemas/ai-article-job.schema';
import {
  type ArticleOutline,
  type ArticleOutlineSection,
  buildArticleSystemInstruction,
  buildArticleUserMessage,
  buildCondensedUserBrief,
  buildExpansionPrompt,
  buildOutlinePrompt,
  buildSectionPrompt,
  countWordsInHtml,
  MULTI_PASS_WORD_THRESHOLD,
  parseTargetWordCount,
} from './prompts/article-generation.prompt';
import { countWords } from './validators/max-words.validator';

const DAILY_LIMIT = 2;
const SECTION_BATCH_SIZE = 2;
const SECTION_API_DELAY_MS = 700;

const THINKING_PHASES = [
  'Talabingizni tahlil qilmoqda...',
  'Mavzu va asosiy g\'oyalarni ajratmoqda...',
  'Maqola tuzilmasini rejalashtirmoqda...',
  'Kirish qismini yozmoqda...',
  'Asosiy qismlarni shakllantirmoqda...',
  'Chuqur tahlil va misollarni qo\'shmoqda...',
  'Xulosa va yakuniy tahrir...',
];

@Injectable()
export class AiArticleService {
  private readonly logger = new Logger(AiArticleService.name);
  private lastGenerationErrors: string[] = [];

  constructor(
    @InjectModel(AiArticleJob.name)
    private readonly jobModel: Model<AiArticleJobDocument>,
    private readonly articlesService: ArticlesService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly realtime: RealtimeService,
  ) {}

  private notifyJobChange(userId: string, jobId?: string) {
    const tags = [...rtTags.aiArticle()];
    if (jobId) {
      tags.push({ type: 'AiArticle', id: jobId });
    }
    this.realtime.invalidate(tags, { userId });
  }

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

    await this.failStaleJobs(userId);

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

    this.notifyJobChange(userId, job.id);

    return { job: this.toPublicJob(job) };
  }

  async getJob(userId: string, jobId: string) {
    const job = await this.findUserJob(userId, jobId);
    return { job: this.toPublicJob(job) };
  }

  async getActiveJob(userId: string) {
    await this.failStaleJobs(userId);

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

    const job = await this.jobModel.findById(jobId).select('userId').lean().exec();
    if (job?.userId) {
      this.notifyJobChange(String(job.userId), jobId);
    }
  }

  private async processJob(jobId: string) {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job || job.status === 'completed' || job.status === 'failed') {
      return;
    }

    try {
      await this.jobModel.findByIdAndUpdate(jobId, { status: 'processing' });

      for (let i = 0; i < THINKING_PHASES.length - 1; i++) {
        await this.delay(900 + Math.random() * 600);
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

      this.notifyJobChange(job.userId.toString(), jobId);
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

      this.notifyJobChange(job.userId.toString(), jobId);
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async failStaleJobs(userId: string) {
    const staleBefore = new Date(Date.now() - 20 * 60 * 1000);

    await this.jobModel.updateMany(
      {
        userId,
        status: { $in: ['pending', 'processing'] },
        createdAt: { $lt: staleBefore },
      },
      {
        status: 'failed',
        errorMessage:
          'Maqola yaratish vaqti tugadi. Qayta urinib ko\'ring.',
        currentStep: 'Xatolik yuz berdi',
        completedAt: new Date(),
      },
    );
  }

  private async generateArticleContent(prompt: string): Promise<{
    title: string;
    contentHtml: string;
  }> {
    const apiKey = this.config.get('geminiApiKey', { infer: true });

    if (!hasGeminiApiKey(apiKey)) {
      throw new Error(
        'GEMINI_API_KEY sozlanmagan. Admin .env faylida Google AI Studio kalitini qo\'ying.',
      );
    }

    const targetWords = parseTargetWordCount(prompt);
    this.lastGenerationErrors = [];
    const result = await this.generateWithGemini(apiKey, prompt, targetWords);

    if (!result) {
      const detail =
        this.lastGenerationErrors.length > 0
          ? pickGeminiErrorMessage(this.lastGenerationErrors)
          : 'AI maqola yozishni tugata olmadi. Bir necha daqiqadan keyin qayta urinib ko\'ring yoki talabni biroz soddalashtiring.';

      throw new Error(detail);
    }

    if (isTemplateGarbage(result.contentHtml)) {
      throw new Error(
        'AI noto\'g\'ri (shablon) javob qaytardi. Qayta urinib ko\'ring.',
      );
    }

    return result;
  }

  private estimateOutputTokens(targetWords: number): number {
    return Math.min(65536, Math.max(4096, Math.ceil(targetWords * 2.8)));
  }

  private shouldUseMultiPass(prompt: string, targetWords: number): boolean {
    return targetWords >= MULTI_PASS_WORD_THRESHOLD || countWords(prompt) >= 50;
  }

  private async generateWithGemini(
    apiKey: string,
    prompt: string,
    targetWords: number,
  ): Promise<{ title: string; contentHtml: string } | null> {
    if (this.shouldUseMultiPass(prompt, targetWords)) {
      const multiPass = await this.generateMultiPassArticle(
        apiKey,
        prompt,
        targetWords,
      );
      if (multiPass) return multiPass;
    }

    const singlePass = await this.generateSinglePassArticle(
      apiKey,
      prompt,
      targetWords,
    );
    if (!singlePass) return null;

    const words = countWordsInHtml(singlePass.contentHtml);
    const minAcceptable = Math.round(targetWords * 0.5);

    if (words < minAcceptable) {
      const multiPass = await this.generateMultiPassArticle(
        apiKey,
        prompt,
        targetWords,
      );
      if (multiPass) return multiPass;
    }

    return singlePass;
  }

  private async generateSinglePassArticle(
    apiKey: string,
    prompt: string,
    targetWords: number,
  ): Promise<{ title: string; contentHtml: string } | null> {
    const raw = await this.callGemini(apiKey, {
      systemInstruction: buildArticleSystemInstruction(targetWords),
      userMessage: buildArticleUserMessage(prompt),
      maxOutputTokens: this.estimateOutputTokens(targetWords),
      json: true,
      temperature: 0.75,
    });

    if (!raw) return null;
    return parseArticleGenerationPayload(raw);
  }

  private async generateMultiPassArticle(
    apiKey: string,
    prompt: string,
    targetWords: number,
  ): Promise<{ title: string; contentHtml: string } | null> {
    const briefPrompt = buildCondensedUserBrief(prompt, 500);
    const outline = await this.generateOutline(apiKey, briefPrompt, targetWords);
    if (!outline || outline.sections.length === 0) {
      this.lastGenerationErrors.push('Maqola rejasi tuzilmadi');
      return null;
    }

    this.redistributeOutlineWords(outline.sections, targetWords);

    const sectionHtmlParts: string[] = [];
    let failedSections = 0;

    for (let i = 0; i < outline.sections.length; ) {
      const remaining = outline.sections.length - i;
      const batchSize =
        remaining > 1 ? Math.min(SECTION_BATCH_SIZE, remaining) : 1;

      if (i > 0) {
        await this.delay(SECTION_API_DELAY_MS);
      }

      const sectionHtml = await this.generateSectionWithRetry(
        apiKey,
        briefPrompt,
        outline.title,
        outline.sections,
        i,
        batchSize,
      );

      if (sectionHtml) {
        sectionHtmlParts.push(sectionHtml);
      } else {
        failedSections += batchSize;
      }

      i += batchSize;
    }

    if (sectionHtmlParts.length === 0) {
      this.lastGenerationErrors.push('Maqola bo\'limlari yozilmadi');
      return null;
    }

    if (failedSections > 0) {
      this.logger.warn(
        `${failedSections}/${outline.sections.length} bo'lim yozilmadi, mavjud qismlar bilan davom etilmoqda`,
      );
    }

    let contentHtml = [
      `<h1>${this.escapeHtml(outline.title)}</h1>`,
      ...sectionHtmlParts,
    ].join('');

    contentHtml = await this.expandArticleIfNeeded(
      apiKey,
      briefPrompt,
      outline.title,
      contentHtml,
      targetWords,
    );

    const words = countWordsInHtml(contentHtml);
    const minWords = Math.max(500, Math.round(targetWords * 0.18));

    if (words < minWords) {
      this.lastGenerationErrors.push(
        `Maqola hajmi yetarli emas (${words}/${targetWords} so'z)`,
      );
      return null;
    }

    return {
      title: outline.title,
      contentHtml,
    };
  }

  private async generateSectionWithRetry(
    apiKey: string,
    prompt: string,
    articleTitle: string,
    sections: ArticleOutlineSection[],
    sectionIndex: number,
    batchSize = 1,
  ): Promise<string | null> {
    const batchWords = sections
      .slice(sectionIndex, sectionIndex + batchSize)
      .reduce((sum, section) => sum + section.targetWords, 0);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) {
        await this.delay(900 + attempt * 400);
      }

      const batchPrompt = buildSectionPrompt(
        prompt,
        articleTitle,
        sections,
        sectionIndex,
        batchSize,
      );

      const raw = await this.callGeminiSafe(apiKey, {
        systemInstruction: buildArticleSystemInstruction(batchWords),
        userMessage: batchPrompt,
        maxOutputTokens: this.estimateOutputTokens(batchWords),
        json: true,
        temperature: attempt === 0 ? 0.72 : 0.68,
      });

      if (!raw) continue;

      const sectionHtml = parseSectionGenerationPayload(raw);
      if (sectionHtml) {
        return sectionHtml;
      }
    }

    return null;
  }

  private async expandArticleIfNeeded(
    apiKey: string,
    prompt: string,
    articleTitle: string,
    contentHtml: string,
    targetWords: number,
  ): Promise<string> {
    let html = contentHtml;
    let words = countWordsInHtml(html);
    const minWords = Math.round(targetWords * 0.82);

    for (let attempt = 0; attempt < 4 && words < minWords; attempt += 1) {
      const wordsNeeded = targetWords - words;
      const expansionPrompt = buildExpansionPrompt(
        prompt,
        articleTitle,
        html,
        wordsNeeded,
      );

      const raw = await this.callGeminiSafe(apiKey, {
        systemInstruction: buildArticleSystemInstruction(
          Math.min(1200, wordsNeeded),
        ),
        userMessage: expansionPrompt,
        maxOutputTokens: this.estimateOutputTokens(
          Math.min(1200, wordsNeeded),
        ),
        json: true,
        temperature: 0.7,
      });

      if (!raw) continue;

      const extraHtml = parseSectionGenerationPayload(raw);
      if (!extraHtml) continue;

      html += extraHtml;
      words = countWordsInHtml(html);
    }

    return html;
  }

  private redistributeOutlineWords(
    sections: ArticleOutlineSection[],
    targetWords: number,
  ): void {
    if (sections.length === 0) return;

    const perSection = Math.ceil(targetWords / sections.length);
    for (const section of sections) {
      section.targetWords = Math.max(280, Math.min(1400, perSection));
    }
  }

  private async generateOutline(
    apiKey: string,
    prompt: string,
    targetWords: number,
  ): Promise<ArticleOutline | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) {
        await this.delay(1000);
      }

      const outlinePrompt = buildOutlinePrompt(prompt, targetWords);
      const raw = await this.callGeminiSafe(apiKey, {
        systemInstruction:
          'Sen professional o\'zbek tilida maqola rejalashtiruvchisan. Foydalanuvchi talabidagi BARCHA bandlarni rejaga qo\'sh.',
        userMessage: outlinePrompt,
        maxOutputTokens: 4096,
        json: true,
        temperature: attempt === 0 ? 0.55 : 0.5,
      });

      const parsed = this.parseOutlinePayload(raw);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private parseOutlinePayload(raw: string | null): ArticleOutline | null {
    if (!raw) return null;

    try {
      const cleaned = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const data = JSON.parse(cleaned) as {
        title?: string;
        sections?: Array<{
          heading?: string;
          level?: number;
          summary?: string;
          targetWords?: number;
        }>;
      };

      const title = data.title?.trim();
      const sections = (data.sections ?? [])
        .map((section) => this.normalizeOutlineSection(section))
        .filter((section): section is ArticleOutlineSection => Boolean(section));

      if (!title || sections.length === 0) return null;

      return { title, sections };
    } catch {
      return null;
    }
  }

  private normalizeOutlineSection(
    section: {
      heading?: string;
      level?: number;
      summary?: string;
      targetWords?: number;
    },
  ): ArticleOutlineSection | null {
    const heading = section.heading?.trim();
    const summary = section.summary?.trim();
    if (!heading || !summary) return null;

    const level: 2 | 3 = section.level === 3 ? 3 : 2;
    const targetWords = Math.max(
      200,
      Math.min(1200, section.targetWords ?? 450),
    );

    return { heading, level, summary, targetWords };
  }

  private async callGeminiSafe(
    apiKey: string,
    options: {
      systemInstruction: string;
      userMessage: string;
      maxOutputTokens: number;
      json?: boolean;
      temperature?: number;
    },
  ): Promise<string | null> {
    try {
      return await this.callGemini(apiKey, options);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'AI xizmati javob bermadi';
      this.lastGenerationErrors.push(message);
      this.logger.warn(`Gemini xavfsiz chaqiruv xatosi: ${message}`);
      return null;
    }
  }

  private async callGemini(
    apiKey: string,
    options: {
      systemInstruction: string;
      userMessage: string;
      maxOutputTokens: number;
      json?: boolean;
      temperature?: number;
    },
  ): Promise<string | null> {
    const result = await callGeminiContent(apiKey, options, GEMINI_GENERATION_MODELS);

    if (result.text) {
      return result.text;
    }

    if (result.errors.length > 0) {
      this.lastGenerationErrors.push(...result.errors);
      this.logger.warn(`Gemini chaqiruvlari muvaffaqiyatsiz: ${result.errors.join(' | ')}`);
      throw new Error(pickGeminiErrorMessage(result.errors));
    }

    return null;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
