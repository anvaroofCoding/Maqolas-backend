import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Article, ArticleDocument } from '../articles/schemas/article.schema';
import { CreateSavedPhraseDto } from './dto/create-saved-phrase.dto';
import { ListSavedPhrasesDto } from './dto/list-saved-phrases.dto';
import {
  SavedPhrase,
  SavedPhraseDocument,
} from './schemas/saved-phrase.schema';

@Injectable()
export class SavedPhrasesService {
  constructor(
    @InjectModel(SavedPhrase.name)
    private readonly savedPhraseModel: Model<SavedPhraseDocument>,
    @InjectModel(Article.name)
    private readonly articleModel: Model<ArticleDocument>,
  ) {}

  async create(userId: string, dto: CreateSavedPhraseDto) {
    const text = dto.text.trim();
    if (text.length < 2) {
      throw new ConflictException('Matn juda qisqa');
    }

    const article = await this.articleModel
      .findById(dto.articleId)
      .select('_id slug title status')
      .lean()
      .exec();

    if (!article || article.status !== 'published') {
      throw new NotFoundException('Maqola topilmadi');
    }

    try {
      const phrase = await this.savedPhraseModel.create({
        userId: new Types.ObjectId(userId),
        articleId: article._id,
        text,
        articleSlug: article.slug,
        articleTitle: article.title,
      });

      return this.toSummary(phrase);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException('Bu ibora allaqachon saqlangan');
      }
      throw error;
    }
  }

  async findAll(userId: string, query: ListSavedPhrasesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [phrases, total] = await Promise.all([
      this.savedPhraseModel
        .find({ userId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.savedPhraseModel
        .countDocuments({ userId: new Types.ObjectId(userId) })
        .exec(),
    ]);

    return {
      phrases: phrases.map((phrase) => this.toSummary(phrase)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async remove(userId: string, phraseId: string) {
    const result = await this.savedPhraseModel
      .deleteOne({
        _id: new Types.ObjectId(phraseId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException('Ibora topilmadi');
    }

    return { success: true };
  }

  private toSummary(phrase: SavedPhraseDocument) {
    const createdAt =
      "createdAt" in phrase && phrase.createdAt instanceof Date
        ? phrase.createdAt.toISOString()
        : new Date().toISOString();

    return {
      id: phrase._id.toString(),
      text: phrase.text,
      articleId: phrase.articleId.toString(),
      articleSlug: phrase.articleSlug,
      articleTitle: phrase.articleTitle,
      createdAt,
    };
  }
}
