import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { AppConfig } from '../config/configuration';
import { Model, Types } from 'mongoose';
import {
  countWordsInHtml,
  extractCoverImage,
  hasImageInHtml,
  MIN_SUBMIT_WORDS,
  extractExcerpt,
  extractExcerptWords,
  extractImageUrls,
} from './article.utils';
import {
  buildPublishedArticleSearchFilter,
  scoreArticleSearchMatch,
} from './article-search.utils';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ListArticlesDto } from './dto/list-articles.dto';
import { ListMyArticlesDto } from './dto/list-my-articles.dto';
import { ListCommentsDto } from './dto/list-comments.dto';
import { SearchArticlesDto } from './dto/search-articles.dto';
import { AdminUpdateArticleDto } from '../admin/dto/admin-update-article.dto';
import { SaveArticleDto } from './dto/save-article.dto';
import {
  ArticleBookmark,
  ArticleBookmarkDocument,
} from './schemas/article-bookmark.schema';
import {
  ArticleRead,
  ArticleReadDocument,
} from './schemas/article-read.schema';
import {
  ArticleLike,
  ArticleLikeDocument,
} from './schemas/article-like.schema';
import { Article, ArticleDocument } from './schemas/article.schema';
import { Comment, CommentDocument } from './schemas/comment.schema';
import {
  CommentLike,
  CommentLikeDocument,
} from './schemas/comment-like.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { ModerationService } from '../moderation/moderation.service';
import { containsProfanity } from '../moderation/utils/profanity-filter';
import { APPROVED_COMMENT_FILTER } from '../moderation/utils/approved-comment-filter';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { RealtimeService } from '../realtime/realtime.service';
import { rtTags } from '../realtime/realtime-tags';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  UserFollow,
  UserFollowDocument,
} from '../users/schemas/user-follow.schema';
import {
  buildPopularityAggregationStages,
  computeFinalFeedScore,
  computeTrendingScore,
  FEED_RANKING,
  type UserInterestProfile,
} from './feed-ranking';
import {
  buildHomepageLayout,
  scoreArticlesForHomepage,
  type LayoutArticle,
} from './homepage-layout';
import { syncFigureLayoutInHtml } from './article-html-layout';
import { runStringUserIdMigrationSafe } from '../common/migrate-string-user-ids';

const NEW_ARTICLE_HOURS = 5;

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || `maqola-${Date.now()}`
  );
}

@Injectable()
export class ArticlesService implements OnModuleInit {
  constructor(
    @InjectModel(Article.name)
    private readonly articleModel: Model<ArticleDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(CommentLike.name)
    private readonly commentLikeModel: Model<CommentLikeDocument>,
    @InjectModel(ArticleLike.name)
    private readonly likeModel: Model<ArticleLikeDocument>,
    @InjectModel(ArticleBookmark.name)
    private readonly bookmarkModel: Model<ArticleBookmarkDocument>,
    @InjectModel(ArticleRead.name)
    private readonly readModel: Model<ArticleReadDocument>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(UserFollow.name)
    private readonly followModel: Model<UserFollowDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    private readonly moderationService: ModerationService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async onModuleInit() {
    await runStringUserIdMigrationSafe(this.commentLikeModel, 'commentlikes');
  }

  buildUploadedImageUrl(filename: string) {
    const baseUrl = this.config
      .get('publicBaseUrl', { infer: true })
      .replace(/\/$/, '');
    return `${baseUrl}/uploads/article-images/${filename}`;
  }

  private async actorDisplayName(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('displayName username')
      .lean()
      .exec();
    return user?.displayName ?? user?.username ?? 'Kimdir';
  }

  async countByAuthor(authorId: string) {
    return this.articleModel.countDocuments({ authorId }).exec();
  }

  async countPublishedByAuthor(authorId: string) {
    return this.articleModel
      .countDocuments({ authorId, status: 'published' })
      .exec();
  }

  async findPublishedByAuthorId(authorId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const filter = { status: 'published' as const, authorId };

    const [articles, total] = await Promise.all([
      this.articleModel
        .find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'displayName username avatarUrl')
        .populate('categoryIds', 'name slug')
        .exec(),
      this.articleModel.countDocuments(filter).exec(),
    ]);

    return {
      articles: articles.map((article) => this.toPublicArticle(article)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findByAuthor(authorId: string, query: ListMyArticlesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = { authorId };

    if (query.status) {
      filter.status = query.status;
    }

    const [articles, total] = await Promise.all([
      this.articleModel
        .find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.articleModel.countDocuments(filter).exec(),
    ]);

    return {
      articles: articles.map((article) => this.toAuthorArticle(article)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async deleteByAuthor(id: string, authorId: string) {
    const article = await this.findByIdForAuthor(id, authorId);

    await Promise.all([
      this.likeModel.deleteMany({ articleId: article._id }).exec(),
      this.bookmarkModel.deleteMany({ articleId: article._id }).exec(),
      this.commentModel.deleteMany({ articleId: article._id }).exec(),
    ]);

    await article.deleteOne();

    this.realtime.invalidate([
      ...rtTags.articleFeed(),
      ...rtTags.articleMine(),
      ...rtTags.articleSaved(),
      ...rtTags.article(id),
      ...rtTags.adminPublished(),
    ]);

    return { deleted: true };
  }

  async toggleSave(articleId: string, userId: string) {
    const article = await this.findPublishedArticleById(articleId);
    const existing = await this.bookmarkModel
      .findOne({ articleId: article._id, userId })
      .exec();

    if (existing) {
      await existing.deleteOne();
      this.realtime.invalidate(
        [...rtTags.articleEngagement(articleId), ...rtTags.articleSaved()],
        { userId },
      );
      return { saved: false };
    }

    await this.bookmarkModel.create({ articleId: article._id, userId });
    this.realtime.invalidate(
      [...rtTags.articleEngagement(articleId), ...rtTags.articleSaved()],
      { userId },
    );
    return { saved: true };
  }

  async findSavedFeed(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [bookmarks, total] = await Promise.all([
      this.bookmarkModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.bookmarkModel.countDocuments({ userId }).exec(),
    ]);

    if (bookmarks.length === 0) {
      return {
        articles: [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };
    }

    const articleIds = bookmarks.map((bookmark) => bookmark.articleId);
    const articles = await this.articleModel
      .find({ _id: { $in: articleIds }, status: 'published' })
      .populate('authorId', 'displayName username avatarUrl')
      .populate('categoryIds', 'name slug')
      .exec();

    const articleMap = new Map(
      articles.map((article) => [article._id.toString(), article]),
    );

    const orderedArticles = bookmarks.flatMap((bookmark) => {
      const article = articleMap.get(bookmark.articleId.toString());
      return article ? [this.toFeedArticle(article)] : [];
    });

    return {
      articles: orderedArticles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async create(authorId: string, dto: SaveArticleDto) {
    const title = dto.title?.trim() || 'Nomsiz maqola';
    const baseSlug = slugify(title);
    const slug = await this.ensureUniqueSlug(baseSlug);
    const contentHtml = this.syncFigureLayoutHtml(
      dto.contentHtml,
      dto.contentJson,
    );

    return this.articleModel.create({
      title,
      slug,
      contentHtml,
      contentJson: dto.contentJson,
      excerpt: extractExcerpt(contentHtml),
      coverImageUrl: extractCoverImage(contentHtml),
      status: dto.status ?? 'draft',
      authorId,
    }).then((article) => {
      this.realtime.invalidate(
        [...rtTags.articleMine(), ...rtTags.article(article.id)],
        { userId: authorId },
      );
      return article;
    });
  }

  async findByIdForAuthor(id: string, authorId: string) {
    const article = await this.articleModel.findById(id).exec();
    if (!article) {
      throw new NotFoundException('Maqola topilmadi');
    }
    if (article.authorId.toString() !== authorId) {
      throw new ForbiddenException('Ruxsat yo\'q');
    }
    return article;
  }

  async update(id: string, authorId: string, dto: SaveArticleDto) {
    const article = await this.findByIdForAuthor(id, authorId);

    if (dto.title !== undefined) {
      article.title = dto.title.trim() || article.title;
      if (dto.title.trim()) {
        article.slug = await this.ensureUniqueSlug(
          slugify(dto.title),
          article.id,
        );
      }
    }

    article.contentHtml = this.syncFigureLayoutHtml(
      dto.contentHtml,
      dto.contentJson ?? (article.contentJson as Record<string, unknown> | undefined),
    );
    article.excerpt = extractExcerpt(article.contentHtml);
    article.coverImageUrl = extractCoverImage(article.contentHtml);
    if (dto.contentJson !== undefined) {
      article.contentJson = dto.contentJson;
    }
    if (
      dto.status === 'draft' &&
      (article.status === 'draft' || article.status === 'rejected')
    ) {
      article.status = 'draft';
    }

    await article.save();

    this.realtime.invalidate(
      [
        ...rtTags.article(id),
        ...rtTags.articleSlug(article.slug),
        ...rtTags.articleMine(),
      ],
      { userId: authorId },
    );

    return article;
  }

  async submitForReview(id: string, authorId: string, dto: SaveArticleDto) {
    const article = await this.findByIdForAuthor(id, authorId);

    const wordCount = countWordsInHtml(dto.contentHtml);
    if (wordCount < MIN_SUBMIT_WORDS) {
      throw new BadRequestException(
        `Maqolada kamida ${MIN_SUBMIT_WORDS} ta so'z bo'lishi kerak`,
      );
    }

    if (!hasImageInHtml(dto.contentHtml)) {
      throw new BadRequestException(
        "Maqolada kamida 1 ta rasm bo'lishi kerak",
      );
    }

    if (dto.title !== undefined) {
      article.title = dto.title.trim() || article.title;
      if (dto.title.trim()) {
        article.slug = await this.ensureUniqueSlug(
          slugify(dto.title),
          article.id,
        );
      }
    }

    article.contentHtml = this.syncFigureLayoutHtml(
      dto.contentHtml,
      dto.contentJson ?? (article.contentJson as Record<string, unknown> | undefined),
    );
    article.excerpt = extractExcerpt(article.contentHtml);
    article.coverImageUrl = extractCoverImage(article.contentHtml);
    if (dto.contentJson !== undefined) {
      article.contentJson = dto.contentJson;
    }

    article.status = 'review';
    article.submittedAt = new Date();
    article.reviewNote = undefined;
    article.reviewedAt = undefined;
    article.reviewedBy = undefined;

    await article.save();

    void this.notificationsService.notifyAdmins({
      actorId: authorId,
      type: 'admin_article_review',
      message: `Yangi maqola ko'rib chiqishga yuborildi: «${article.title}»`,
      link: '/admin?tab=review',
      articleId: article.id,
    });

    this.realtime.invalidate(
      [
        ...rtTags.article(id),
        ...rtTags.articleMine(),
        ...rtTags.adminReviewQueue(),
      ],
      { userId: authorId, admin: true },
    );

    return article;
  }

  async findPublishedForAdmin(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const filter = { status: 'published' as const };

    const [articles, total] = await Promise.all([
      this.articleModel
        .find(filter)
        .sort({ isPinned: -1, publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'displayName username avatarUrl email')
        .populate('categoryIds', 'name slug')
        .exec(),
      this.articleModel.countDocuments(filter).exec(),
    ]);

    return {
      articles: articles.map((article) => this.toModerationArticle(article)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findByIdForAdmin(id: string) {
    const article = await this.articleModel
      .findById(id)
      .populate('authorId', 'displayName username avatarUrl email')
      .populate('categoryIds', 'name slug')
      .exec();

    if (!article) {
      throw new NotFoundException('Maqola topilmadi');
    }

    if (!['review', 'published', 'rejected'].includes(article.status)) {
      throw new ForbiddenException('Bu maqolani tahrirlash mumkin emas');
    }

    return this.toModerationArticle(article);
  }

  async updateByAdmin(id: string, dto: AdminUpdateArticleDto) {
    const article = await this.articleModel.findById(id).exec();

    if (!article) {
      throw new NotFoundException('Maqola topilmadi');
    }

    if (!['review', 'published', 'rejected'].includes(article.status)) {
      throw new ForbiddenException('Bu maqolani tahrirlash mumkin emas');
    }

    if (dto.title !== undefined) {
      article.title = dto.title.trim() || article.title;
      if (dto.title.trim()) {
        article.slug = await this.ensureUniqueSlug(
          slugify(dto.title),
          article.id,
        );
      }
    }

    article.contentHtml = this.syncFigureLayoutHtml(
      dto.contentHtml,
      dto.contentJson ?? (article.contentJson as Record<string, unknown> | undefined),
    );
    article.excerpt = extractExcerpt(article.contentHtml);
    article.coverImageUrl = extractCoverImage(article.contentHtml);
    if (dto.contentJson !== undefined) {
      article.contentJson = dto.contentJson;
    }

    await article.save();

    this.realtime.invalidate([
      ...rtTags.article(id),
      ...rtTags.articleSlug(article.slug),
      ...rtTags.adminPublished(),
      ...(article.status === 'published' ? rtTags.articleFeed() : []),
    ], { admin: true, public: article.status === 'published' });

    return this.findByIdForAdmin(id);
  }

  async setPinned(id: string, isPinned: boolean) {
    const article = await this.articleModel.findById(id).exec();

    if (!article) {
      throw new NotFoundException('Maqola topilmadi');
    }

    if (article.status !== 'published') {
      throw new BadRequestException(
        'Faqat nashr etilgan maqolalarni qadash mumkin',
      );
    }

    article.isPinned = isPinned;
    await article.save();

    this.realtime.invalidate([
      ...rtTags.articleFeed(),
      ...rtTags.article(id),
      ...rtTags.articleSlug(article.slug),
      ...rtTags.adminPublished(),
    ], { admin: true });

    return this.findModerationArticleById(id);
  }

  async deleteByAdmin(id: string) {
    const article = await this.articleModel.findById(id).exec();

    if (!article) {
      throw new NotFoundException('Maqola topilmadi');
    }

    await Promise.all([
      this.likeModel.deleteMany({ articleId: article._id }).exec(),
      this.bookmarkModel.deleteMany({ articleId: article._id }).exec(),
      this.commentModel.deleteMany({ articleId: article._id }).exec(),
    ]);

    await article.deleteOne();

    this.realtime.invalidate([
      ...rtTags.articleFeed(),
      ...rtTags.articleMine(),
      ...rtTags.articleSaved(),
      ...rtTags.article(id),
      ...rtTags.articleSlug(article.slug),
      ...rtTags.adminPublished(),
      ...rtTags.adminReviewQueue(),
    ], { admin: true });

    return { deleted: true };
  }

  async findReviewQueue(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const filter = { status: 'review' as const };

    const [articles, total] = await Promise.all([
      this.articleModel
        .find(filter)
        .sort({ submittedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'displayName username avatarUrl email')
        .exec(),
      this.articleModel.countDocuments(filter).exec(),
    ]);

    return {
      articles: articles.map((article) => this.toModerationArticle(article)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async approveArticle(
    id: string,
    adminId: string,
    categoryIds: string[],
    sendEmailNotification = false,
  ) {
    const article = await this.articleModel.findById(id).exec();
    if (!article) {
      throw new NotFoundException('Maqola topilmadi');
    }
    if (article.status !== 'review') {
      throw new ForbiddenException('Maqola ko\'rib chiqish navbatida emas');
    }

    const categories = await this.categoryModel
      .find({ _id: { $in: categoryIds }, isActive: true })
      .exec();

    if (categories.length !== categoryIds.length) {
      throw new NotFoundException('Bir yoki bir nechta mavzu topilmadi');
    }

    article.status = 'published';
    article.reviewNote = undefined;
    article.reviewedAt = new Date();
    article.reviewedBy = new Types.ObjectId(adminId);
    article.publishedAt = new Date();
    article.categoryIds = categories.map((category) => category._id);

    await article.save();

    const author = await this.userModel
      .findById(article.authorId)
      .select('displayName')
      .lean()
      .exec();

    void this.notificationsService.createSafe({
      recipientId: article.authorId.toString(),
      type: 'article_approved',
      message: `"${article.title}" maqolangiz tasdiqlandi va nashr etildi`,
      link: `/maqola/${article.slug}`,
      articleId: article.id,
    });

    if (sendEmailNotification) {
      this.emailService.notifyUsersAboutNewArticleSafe({
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt,
        authorDisplayName: author?.displayName ?? 'Muallif',
      });
    }

    this.realtime.invalidate([
      ...rtTags.articleFeed(),
      ...rtTags.article(id),
      ...rtTags.articleSlug(article.slug),
      ...rtTags.articleMine(),
      ...rtTags.adminReviewQueue(),
      ...rtTags.adminPublished(),
      ...rtTags.adminStats(),
    ], { userId: article.authorId.toString(), admin: true });

    return this.findModerationArticleById(id);
  }

  async rejectArticle(id: string, adminId: string, reason: string) {
    const article = await this.articleModel.findById(id).exec();
    if (!article) {
      throw new NotFoundException('Maqola topilmadi');
    }
    if (article.status !== 'review') {
      throw new ForbiddenException('Maqola ko\'rib chiqish navbatida emas');
    }

    article.status = 'rejected';
    article.reviewNote = reason.trim();
    article.reviewedAt = new Date();
    article.reviewedBy = new Types.ObjectId(adminId);

    await article.save();

    void this.notificationsService.createSafe({
      recipientId: article.authorId.toString(),
      type: 'article_rejected',
      message: `"${article.title}" maqolangiz rad etildi`,
      link: `/yozish/${article.id}`,
      articleId: article.id,
    });

    this.realtime.invalidate([
      ...rtTags.article(id),
      ...rtTags.articleMine(),
      ...rtTags.adminReviewQueue(),
    ], { userId: article.authorId.toString(), admin: true });

    return this.findModerationArticleById(id);
  }

  async getEngagement(articleId: string, userId?: string) {
    const article = await this.findPublishedArticleById(articleId);

    let likedByMe = false;
    let savedByMe = false;
    if (userId) {
      const [like, bookmark] = await Promise.all([
        this.likeModel.exists({ articleId: article._id, userId }).exec(),
        this.bookmarkModel.exists({ articleId: article._id, userId }).exec(),
      ]);
      likedByMe = Boolean(like);
      savedByMe = Boolean(bookmark);
    }

    return {
      likeCount: article.likeCount ?? 0,
      commentCount: article.commentCount ?? 0,
      likedByMe,
      savedByMe,
    };
  }

  async toggleLike(articleId: string, userId: string) {
    const article = await this.findPublishedArticleById(articleId);
    const existing = await this.likeModel
      .findOne({ articleId: article._id, userId })
      .exec();

    if (existing) {
      await existing.deleteOne();
      article.likeCount = Math.max(0, (article.likeCount ?? 0) - 1);
      await article.save();
      this.realtime.invalidate([
        ...rtTags.articleEngagement(articleId),
        ...rtTags.articleFeed(),
      ]);
      return { liked: false, likeCount: article.likeCount };
    }

    await this.likeModel.create({ articleId: article._id, userId });
    article.likeCount = (article.likeCount ?? 0) + 1;
    await article.save();

    const actorName = await this.actorDisplayName(userId);
    void this.notificationsService.createSafe({
      recipientId: article.authorId.toString(),
      actorId: userId,
      type: 'article_liked',
      message: `${actorName} maqolangizni yoqtirdi`,
      link: `/maqola/${article.slug}`,
      articleId: article.id,
    });

    this.realtime.invalidate([
      ...rtTags.articleEngagement(articleId),
      ...rtTags.articleFeed(),
    ]);

    return { liked: true, likeCount: article.likeCount };
  }

  async listComments(
    articleId: string,
    query: ListCommentsDto,
    viewerId?: string,
  ) {
    const article = await this.findPublishedArticleById(articleId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const comments = await this.commentModel
      .find({ articleId: article._id, ...APPROVED_COMMENT_FILTER })
      .sort({ createdAt: 1 })
      .populate('authorId', 'displayName username avatarUrl')
      .exec();

    const likedIds = viewerId
      ? await this.getLikedCommentIds(
          comments.map((comment) => String(comment._id)),
          viewerId,
        )
      : new Set<string>();

    const publicComments = comments.map((comment) => ({
      ...this.toPublicComment(comment),
      likedByMe: likedIds.has(String(comment._id)),
    }));
    const roots = this.buildCommentTree(publicComments);

    const total = roots.length;
    const skip = (page - 1) * limit;
    const paginatedRoots = roots.slice(skip, skip + limit);

    return {
      comments: paginatedRoots,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async createComment(
    articleId: string,
    userId: string,
    dto: CreateCommentDto,
    authorIp?: string,
  ) {
    await this.moderationService.assertNotBanned(userId, authorIp);

    const article = await this.findPublishedArticleById(articleId);
    const content = dto.content.trim();

    if (!content) {
      throw new ForbiddenException('Izoh bo\'sh bo\'lmasligi kerak');
    }
    if (containsProfanity(content)) {
      throw new BadRequestException(
        'Izohda taqiqlangan so\'zlar bor. Iltimos, izohni tozalab qayta yuboring.',
      );
    }

    let parentId: Types.ObjectId | undefined;

    if (dto.parentId) {
      if (!Types.ObjectId.isValid(dto.parentId)) {
        throw new NotFoundException('Javob berilayotgan izoh topilmadi');
      }

      const parent = await this.commentModel
        .findOne({
          _id: dto.parentId,
          articleId: article._id,
          ...APPROVED_COMMENT_FILTER,
        })
        .exec();

      if (!parent) {
        throw new NotFoundException('Javob berilayotgan izoh topilmadi');
      }

      parentId = parent._id;
    }

    const comment = await this.commentModel.create({
      articleId: article._id,
      authorId: userId,
      content,
      parentId,
      authorIp,
      status: 'pending',
    });

    const populated = await this.commentModel
      .findById(comment._id)
      .populate('authorId', 'displayName username avatarUrl')
      .exec();

    this.realtime.invalidate(rtTags.adminComments(), { admin: true });

    return {
      comment: this.toPublicComment(populated!),
      commentCount: article.commentCount ?? 0,
      pending: true,
    };
  }

  async deleteComment(articleId: string, commentId: string, userId: string) {
    const article = await this.findPublishedArticleById(articleId);

    if (!Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Izoh topilmadi');
    }

    const comment = await this.commentModel
      .findOne({
        _id: commentId,
        articleId: article._id,
        ...APPROVED_COMMENT_FILTER,
      })
      .exec();

    if (!comment) {
      throw new NotFoundException('Izoh topilmadi');
    }

    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('Faqat o\'z izohingizni o\'chira olasiz');
    }

    const allComments = await this.commentModel
      .find({ articleId: article._id })
      .select('_id parentId status')
      .exec();

    const idsToDelete = new Set<string>([comment._id.toString()]);
    let expanded = true;

    while (expanded) {
      expanded = false;
      for (const item of allComments) {
        const id = item._id.toString();
        const parentId = item.parentId?.toString();
        if (parentId && idsToDelete.has(parentId) && !idsToDelete.has(id)) {
          idsToDelete.add(id);
          expanded = true;
        }
      }
    }

    const deleteIds = Array.from(idsToDelete).map((id) => new Types.ObjectId(id));
    const approvedDeleteCount = allComments.filter(
      (item) =>
        idsToDelete.has(item._id.toString()) &&
        (!item.status || item.status === 'approved'),
    ).length;

    await Promise.all([
      this.commentModel.deleteMany({ _id: { $in: deleteIds } }).exec(),
      this.commentLikeModel
        .deleteMany({ commentId: { $in: deleteIds } })
        .exec(),
    ]);

    if (approvedDeleteCount > 0) {
      article.commentCount = Math.max(
        0,
        (article.commentCount ?? 0) - approvedDeleteCount,
      );
      await article.save();
    }

    this.realtime.invalidate([
      ...rtTags.articleComments(articleId),
      ...rtTags.articleEngagement(articleId),
      ...rtTags.articleFeed(),
      ...rtTags.popularComments(),
    ]);

    return {
      deleted: true,
      commentCount: article.commentCount ?? 0,
    };
  }

  async toggleCommentLike(
    articleId: string,
    commentId: string,
    userId: string,
  ) {
    const article = await this.findPublishedArticleById(articleId);

    if (!Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Izoh topilmadi');
    }

    const comment = await this.commentModel
      .findOne({
        _id: commentId,
        articleId: article._id,
        ...APPROVED_COMMENT_FILTER,
      })
      .exec();

    if (!comment) {
      throw new NotFoundException('Izoh topilmadi');
    }

    const userObjectId = new Types.ObjectId(userId);
    const existing = await this.commentLikeModel
      .findOne({ commentId: comment._id, userId: userObjectId })
      .exec();

    if (existing) {
      await existing.deleteOne();
      comment.likeCount = Math.max(0, (comment.likeCount ?? 0) - 1);
      await comment.save();
      this.realtime.invalidate([
        ...rtTags.articleComments(articleId),
        ...rtTags.popularComments(),
      ]);
      return { liked: false, likeCount: comment.likeCount };
    }

    await this.commentLikeModel.create({
      commentId: comment._id,
      userId: userObjectId,
    });
    comment.likeCount = (comment.likeCount ?? 0) + 1;
    await comment.save();

    this.realtime.invalidate([
      ...rtTags.articleComments(articleId),
      ...rtTags.popularComments(),
    ]);

    return { liked: true, likeCount: comment.likeCount };
  }

  async listPopularComments(limit = 5, viewerId?: string) {
    const publishedArticles = await this.articleModel
      .find({ status: 'published' })
      .select('_id slug title')
      .lean()
      .exec();

    if (publishedArticles.length === 0) {
      return { comments: [] };
    }

    const articleMap = new Map(
      publishedArticles.map((article) => [
        String(article._id),
        {
          id: String(article._id),
          slug: article.slug as string,
          title: article.title as string,
        },
      ]),
    );
    const articleIds = publishedArticles.map((article) => article._id);

    const comments = await this.commentModel
      .find({ articleId: { $in: articleIds }, ...APPROVED_COMMENT_FILTER })
      .sort({ likeCount: -1, createdAt: -1 })
      .limit(limit)
      .populate('authorId', 'displayName username avatarUrl')
      .exec();

    const likedIds = viewerId
      ? await this.getLikedCommentIds(
          comments.map((comment) => String(comment._id)),
          viewerId,
        )
      : new Set<string>();

    return {
      comments: comments
        .map((comment) => {
          const article = articleMap.get(comment.articleId.toString());
          if (!article) return null;

          return {
            ...this.toPublicComment(comment),
            likedByMe: likedIds.has(String(comment._id)),
            article,
          };
        })
        .filter(Boolean),
    };
  }

  private async getLikedCommentIds(commentIds: string[], userId: string) {
    if (commentIds.length === 0 || !Types.ObjectId.isValid(userId)) {
      return new Set<string>();
    }

    const commentObjectIds = commentIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (commentObjectIds.length === 0) {
      return new Set<string>();
    }

    const likes = await this.commentLikeModel
      .find({
        commentId: { $in: commentObjectIds },
        userId: new Types.ObjectId(userId),
      })
      .select('commentId')
      .lean()
      .exec();

    return new Set(likes.map((like) => String(like.commentId)));
  }

  private buildCommentTree(
    comments: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    const byId = new Map<string, Record<string, unknown>>();
    const roots: Array<Record<string, unknown>> = [];

    for (const comment of comments) {
      byId.set(String(comment.id), { ...comment, replies: [] });
    }

    for (const comment of comments) {
      const node = byId.get(String(comment.id))!;
      const parentId = comment.parentId ? String(comment.parentId) : null;

      if (parentId && byId.has(parentId)) {
        const parent = byId.get(parentId)!;
        (parent.replies as Array<Record<string, unknown>>).push(node);
      } else if (!parentId) {
        roots.push(node);
      }
    }

    return roots.sort((a, b) => {
      const aTime = new Date(String(a.createdAt ?? 0)).getTime();
      const bTime = new Date(String(b.createdAt ?? 0)).getTime();
      return bTime - aTime;
    });
  }

  private async findModerationArticleById(id: string) {
    const article = await this.articleModel
      .findById(id)
      .populate('authorId', 'displayName username avatarUrl email')
      .populate('categoryIds', 'name slug')
      .exec();

    if (!article) {
      throw new NotFoundException('Maqola topilmadi');
    }

    return this.toModerationArticle(article);
  }

  async findPublishedFeed(params: ListArticlesDto, userId?: string) {
    const sort = params.sort ?? 'popular';

    if (sort === 'newest') {
      return this.findNewestFeed(params);
    }

    if (sort === 'forYou' && userId) {
      return this.findPersonalizedFeed(params, userId);
    }

    return this.findTrendingFeed(params, undefined, 'popular');
  }

  async findHomepageLayout(userId?: string) {
    const filter = await this.buildPublishedFeedFilter({});
    const mode = userId ? 'forYou' : 'popular';

    if (!filter) {
      return this.emptyHomepageLayout(mode);
    }

    const profile = userId ? await this.buildUserInterestProfile(userId) : null;
    const now = Date.now();

    const [total, candidates, latestRaw] = await Promise.all([
      this.articleModel.countDocuments(filter).exec(),
      this.articleModel
        .aggregate([
          { $match: filter },
          ...buildPopularityAggregationStages(new Date(now)),
          { $sort: { isPinned: -1, popularityScore: -1, createdAt: -1 } },
          { $limit: FEED_RANKING.HOMEPAGE_CANDIDATE_POOL },
        ])
        .exec(),
      this.articleModel
        .find(filter)
        .sort({ isPinned: -1, publishedAt: -1, createdAt: -1 })
        .limit(12)
        .lean()
        .exec(),
    ]);

    this.enrichLayoutCandidates(candidates);
    this.enrichLayoutCandidates(latestRaw as LayoutArticle[]);

    const ranked = scoreArticlesForHomepage(candidates, profile, mode, now);
    const layoutDraft = buildHomepageLayout(
      ranked,
      latestRaw as LayoutArticle[],
      now,
    );

    const layoutIds = this.collectLayoutArticleIds(layoutDraft);
    const layoutArticles = await this.hydrateArticlesInOrder(layoutIds);
    const layoutById = new Map(layoutArticles.map((article) => [article.id, article]));

    const mapSection = (articles: LayoutArticle[]) =>
      articles
        .map((article) => layoutById.get(String(article._id ?? article.id)))
        .filter((article): article is NonNullable<typeof article> => Boolean(article));

    const rankedArticles = [...ranked].sort((a, b) => {
      if (Boolean(a.article.isPinned) !== Boolean(b.article.isPinned)) {
        return a.article.isPinned ? -1 : 1;
      }
      return b.spotlightScore - a.spotlightScore;
    });
    const feedLimit = 10;
    const feedIds = rankedArticles
      .map((item) => item.article._id as Types.ObjectId)
      .slice(0, feedLimit);

    return {
      algorithm: mode,
      layout: {
        hero: mapSection(layoutDraft.hero)[0] ?? null,
        leftLead: mapSection(layoutDraft.leftLead),
        centerList: mapSection(layoutDraft.centerList),
        editorChoice: mapSection(layoutDraft.editorChoice)[0] ?? null,
        centerFill: mapSection(layoutDraft.centerFill),
        latest: mapSection(layoutDraft.latest),
        urgentLead: mapSection(layoutDraft.urgentLead)[0] ?? null,
        urgentGrid: mapSection(layoutDraft.urgentGrid),
        showcase: mapSection(layoutDraft.showcase),
        lowerGrid: mapSection(layoutDraft.lowerGrid),
      },
      feed: {
        articles: await this.hydrateArticlesInOrder(feedIds),
        pagination: {
          page: 1,
          limit: feedLimit,
          total,
          totalPages: Math.ceil(total / feedLimit) || 1,
        },
      },
    };
  }

  async searchPublished(params: SearchArticlesDto) {
    const query = params.q.trim();
    const limit = params.limit ?? 10;
    const filter = buildPublishedArticleSearchFilter(query);

    if (!filter) {
      return { articles: [] };
    }

    const articles = await this.articleModel
      .find(filter)
      .limit(Math.min(limit * 3, 60))
      .populate('authorId', 'displayName username avatarUrl')
      .populate('categoryIds', 'name slug')
      .exec();

    const ranked = articles
      .map((article) => ({
        article,
        score: scoreArticleSearchMatch(
          {
            title: article.title,
            excerpt: article.excerpt,
            contentHtml: article.contentHtml,
          },
          query,
        ),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        const aPublished = a.article.publishedAt?.getTime() ?? 0;
        const bPublished = b.article.publishedAt?.getTime() ?? 0;
        return bPublished - aPublished;
      })
      .slice(0, limit)
      .map(({ article }) => {
        return this.toFeedArticle(article);
      });

    return { articles: ranked };
  }

  private async buildPublishedFeedFilter(params: ListArticlesDto) {
    const filter: Record<string, unknown> = { status: 'published' };

    if (params.category?.trim()) {
      const category = await this.categoryModel
        .findOne({
          slug: params.category.trim().toLowerCase(),
          isActive: true,
        })
        .exec();

      if (!category) {
        return null;
      }

      filter.categoryIds = category._id;
    }

    return filter;
  }

  private async hydrateArticlesInOrder(articleIds: Types.ObjectId[]) {
    if (articleIds.length === 0) {
      return [];
    }

    const articles = await this.articleModel
      .find({ _id: { $in: articleIds } })
      .populate('authorId', 'displayName username avatarUrl')
      .populate('categoryIds', 'name slug')
      .exec();

    const order = new Map(
      articleIds.map((id, index) => [String(id), index]),
    );

    return articles
      .sort(
        (a, b) =>
          (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0),
      )
      .map((article) => this.toFeedArticle(article));
  }

  private async findNewestFeed(params: ListArticlesDto) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;
    const filter = await this.buildPublishedFeedFilter(params);

    if (!filter) {
      return {
        articles: [],
        pagination: { page, limit, total: 0, totalPages: 1 },
      };
    }

    const since = new Date(Date.now() - NEW_ARTICLE_HOURS * 60 * 60 * 1000);
    filter.$or = [
      { publishedAt: { $gte: since } },
      { publishedAt: { $exists: false }, createdAt: { $gte: since } },
    ];

    const [articles, total] = await Promise.all([
      this.articleModel
        .find(filter)
        .sort({ isPinned: -1, publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'displayName username avatarUrl')
        .populate('categoryIds', 'name slug')
        .exec(),
      this.articleModel.countDocuments(filter).exec(),
    ]);

    return {
      articles: articles.map((article) => this.toFeedArticle(article)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private async findTrendingFeed(
    params: ListArticlesDto,
    userId?: string,
    mode: 'popular' | 'forYou' = 'popular',
  ) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;
    const filter = await this.buildPublishedFeedFilter(params);

    if (!filter) {
      return {
        articles: [],
        pagination: { page, limit, total: 0, totalPages: 1 },
      };
    }

    const effectiveMode = mode === 'forYou' && userId ? 'forYou' : 'popular';
    const profile =
      effectiveMode === 'forYou' && userId
        ? await this.buildUserInterestProfile(userId)
        : null;

    const [total, candidates] = await Promise.all([
      this.articleModel.countDocuments(filter).exec(),
      this.articleModel
        .aggregate([
          { $match: filter },
          ...buildPopularityAggregationStages(),
          { $sort: { isPinned: -1, popularityScore: -1, createdAt: -1 } },
          { $limit: FEED_RANKING.CANDIDATE_POOL_SIZE },
        ])
        .exec(),
    ]);

    const ranked = this.sortRankedArticles(
      candidates.map((article) => ({
        article,
        finalScore: computeTrendingScore(article, profile, effectiveMode),
      })),
      effectiveMode,
    );

    const pageSlice = ranked.slice(skip, skip + limit);
    const articleIds = pageSlice.map((item) => item.article._id as Types.ObjectId);

    return {
      articles: await this.hydrateArticlesInOrder(articleIds),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private async buildUserInterestProfile(
    userId: string,
  ): Promise<UserInterestProfile> {
    const userOid = new Types.ObjectId(userId);
    const categoryWeights: Record<string, number> = {};
    const articleCollection = this.articleModel.collection.name;

    const addCategoryWeights = (
      rows: Array<{ _id?: Types.ObjectId | null; count: number }>,
      weight: number,
    ) => {
      for (const row of rows) {
        if (!row._id) continue;
        const key = String(row._id);
        categoryWeights[key] = (categoryWeights[key] ?? 0) + row.count * weight;
      }
    };

    const [likeCategories, commentCategories, bookmarkCategories, readCategories, follows, likedAuthors, commentedAuthors] =
      await Promise.all([
        this.likeModel
          .aggregate([
            { $match: { userId: userOid } },
            {
              $lookup: {
                from: articleCollection,
                localField: 'articleId',
                foreignField: '_id',
                as: 'article',
              },
            },
            { $unwind: '$article' },
            { $unwind: '$article.categoryIds' },
            { $group: { _id: '$article.categoryIds', count: { $sum: 1 } } },
          ])
          .exec(),
        this.commentModel
          .aggregate([
            { $match: { authorId: userOid } },
            {
              $lookup: {
                from: articleCollection,
                localField: 'articleId',
                foreignField: '_id',
                as: 'article',
              },
            },
            { $unwind: '$article' },
            { $unwind: '$article.categoryIds' },
            { $group: { _id: '$article.categoryIds', count: { $sum: 1 } } },
          ])
          .exec(),
        this.bookmarkModel
          .aggregate([
            { $match: { userId: userOid } },
            {
              $lookup: {
                from: articleCollection,
                localField: 'articleId',
                foreignField: '_id',
                as: 'article',
              },
            },
            { $unwind: '$article' },
            { $unwind: '$article.categoryIds' },
            { $group: { _id: '$article.categoryIds', count: { $sum: 1 } } },
          ])
          .exec(),
        this.readModel
          .aggregate([
            { $match: { userId: userOid } },
            {
              $lookup: {
                from: articleCollection,
                localField: 'articleId',
                foreignField: '_id',
                as: 'article',
              },
            },
            { $unwind: '$article' },
            { $unwind: '$article.categoryIds' },
            { $group: { _id: '$article.categoryIds', count: { $sum: '$readCount' } } },
          ])
          .exec(),
        this.followModel
          .find({ followerId: userOid })
          .select('followingId')
          .lean()
          .exec(),
        this.likeModel
          .aggregate([
            { $match: { userId: userOid } },
            {
              $lookup: {
                from: articleCollection,
                localField: 'articleId',
                foreignField: '_id',
                as: 'article',
              },
            },
            { $unwind: '$article' },
            { $group: { _id: '$article.authorId' } },
          ])
          .exec(),
        this.commentModel
          .aggregate([
            { $match: { authorId: userOid } },
            {
              $lookup: {
                from: articleCollection,
                localField: 'articleId',
                foreignField: '_id',
                as: 'article',
              },
            },
            { $unwind: '$article' },
            { $group: { _id: '$article.authorId' } },
          ])
          .exec(),
      ]);

    addCategoryWeights(
      likeCategories,
      FEED_RANKING.INTERACTION_CATEGORY_LIKE,
    );
    addCategoryWeights(
      commentCategories,
      FEED_RANKING.INTERACTION_CATEGORY_COMMENT,
    );
    addCategoryWeights(
      bookmarkCategories,
      FEED_RANKING.INTERACTION_CATEGORY_BOOKMARK,
    );
    addCategoryWeights(
      readCategories,
      FEED_RANKING.INTERACTION_CATEGORY_READ,
    );

    const followedAuthorIds = new Set(
      follows.map((follow) => String(follow.followingId)),
    );
    const engagedAuthorIds = new Set<string>();

    for (const row of [...likedAuthors, ...commentedAuthors]) {
      if (row._id) {
        engagedAuthorIds.add(String(row._id));
      }
    }

    return {
      categoryWeights,
      followedAuthorIds,
      engagedAuthorIds,
    };
  }

  async recordArticleRead(userId: string, articleId: string) {
    try {
      await this.readModel.updateOne(
        {
          userId: new Types.ObjectId(userId),
          articleId: new Types.ObjectId(articleId),
        },
        {
          $inc: { readCount: 1 },
          $set: { lastReadAt: new Date() },
        },
        { upsert: true },
      );
    } catch {
      // O'qish yozuvi muvaffaqiyatsiz bo'lsa, maqola ko'rinishiga ta'sir qilmasin
    }
  }

  async getWeeklyRecommendationsForUser(userId: string, limit = 5) {
    const profile = await this.buildUserInterestProfile(userId);
    const topCategoryIds = Object.entries(profile.categoryWeights)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 2)
      .map(([categoryId]) => categoryId);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const userOid = new Types.ObjectId(userId);

    const readRows = await this.readModel
      .find({ userId: userOid })
      .select('articleId')
      .lean()
      .exec();
    const excludeIds = readRows.map((row) => row.articleId);

    let topCategoryNames: string[] = [];
    const filter: Record<string, unknown> = {
      status: 'published',
      publishedAt: { $gte: weekAgo },
      authorId: { $ne: userOid },
    };

    if (excludeIds.length > 0) {
      filter._id = { $nin: excludeIds };
    }

    if (topCategoryIds.length > 0) {
      const categoryObjectIds = topCategoryIds.map((id) => new Types.ObjectId(id));
      filter.categoryIds = { $in: categoryObjectIds };
      const categories = await this.categoryModel
        .find({ _id: { $in: categoryObjectIds } })
        .select('name')
        .lean()
        .exec();
      topCategoryNames = categories.map((category) => category.name);
    }

    const candidates = await this.articleModel
      .find(filter)
      .populate('authorId', 'displayName')
      .sort({ publishedAt: -1 })
      .limit(50)
      .exec();

    if (candidates.length === 0) {
      return null;
    }

    const ranked = candidates
      .map((article) => ({
        article,
        score: computeFinalFeedScore(article, profile, 'forYou'),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);

    if (ranked.length === 0) {
      return null;
    }

    return {
      topCategoryNames,
      articles: ranked.map(({ article }) => {
        const author = article.authorId as unknown as {
          displayName?: string;
        } | null;
        return {
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          authorDisplayName: author?.displayName ?? 'Muallif',
        };
      }),
    };
  }

  private async findPersonalizedFeed(params: ListArticlesDto, userId: string) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const skip = (page - 1) * limit;
    const filter = await this.buildPublishedFeedFilter(params);

    if (!filter) {
      return {
        articles: [],
        pagination: { page, limit, total: 0, totalPages: 1 },
      };
    }

    const [profile, total, candidates] = await Promise.all([
      this.buildUserInterestProfile(userId),
      this.articleModel.countDocuments(filter).exec(),
      this.articleModel
        .aggregate([
          { $match: filter },
          ...buildPopularityAggregationStages(),
          { $sort: { isPinned: -1, popularityScore: -1, createdAt: -1 } },
          { $limit: FEED_RANKING.CANDIDATE_POOL_SIZE },
        ])
        .exec(),
    ]);

    const ranked = this.sortRankedArticles(
      candidates.map((article) => ({
        article,
        finalScore: computeFinalFeedScore(article, profile, 'forYou'),
      })),
      'forYou',
    );

    const pageSlice = ranked.slice(skip, skip + limit);
    const articleIds = pageSlice.map((item) => item.article._id as Types.ObjectId);

    return {
      articles: await this.hydrateArticlesInOrder(articleIds),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findPublishedBySlug(
    slug: string,
    options?: { trackView?: boolean; userId?: string },
  ) {
    const trackView = options?.trackView !== false;

    const article = trackView
      ? await this.articleModel
          .findOneAndUpdate(
            { slug, status: 'published' },
            { $inc: { viewCount: 1 } },
            { new: true },
          )
          .populate('authorId', 'displayName username avatarUrl bio')
          .populate('categoryIds', 'name slug')
          .exec()
      : await this.articleModel
          .findOne({ slug, status: 'published' })
          .populate('authorId', 'displayName username avatarUrl bio')
          .populate('categoryIds', 'name slug')
          .exec();

    if (!article) {
      throw new NotFoundException('Maqola topilmadi');
    }

    if (options?.userId) {
      void this.recordArticleRead(options.userId, article.id);
    }

    this.applyFigureLayoutToArticle(article);

    return this.toPublicArticle(article, { includeContentJson: true });
  }

  async listPublishedForSitemap() {
    const articles = await this.articleModel
      .find({ status: 'published' })
      .select('slug updatedAt publishedAt')
      .sort({ publishedAt: -1 })
      .lean()
      .exec();

    return articles.map((article) => ({
      slug: article.slug,
      updatedAt:
        article.updatedAt?.toISOString() ??
        article.publishedAt?.toISOString() ??
        new Date().toISOString(),
    }));
  }

  async listPublishedAuthorProfilesForSitemap() {
    const rows = await this.articleModel.aggregate<{
      username: string;
      updatedAt?: Date;
    }>([
      {
        $match: {
          status: 'published',
          authorId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$authorId',
          updatedAt: { $max: '$updatedAt' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'author',
        },
      },
      { $unwind: '$author' },
      {
        $project: {
          _id: 0,
          username: '$author.username',
          updatedAt: 1,
        },
      },
      { $sort: { updatedAt: -1 } },
    ]);

    return rows
      .filter((row) => typeof row.username === 'string' && row.username.length > 0)
      .map((row) => ({
        username: row.username,
        updatedAt:
          row.updatedAt?.toISOString() ?? new Date().toISOString(),
      }));
  }

  private async findPublishedArticleById(articleId: string) {
    if (!Types.ObjectId.isValid(articleId)) {
      throw new NotFoundException('Maqola topilmadi');
    }

    const article = await this.articleModel
      .findOne({ _id: articleId, status: 'published' })
      .exec();

    if (!article) {
      throw new NotFoundException('Maqola topilmadi');
    }

    return article;
  }

  private toPublicComment(comment: CommentDocument) {
    const json = comment.toJSON() as Record<string, unknown>;

    if (json.parentId) {
      json.parentId = String(json.parentId);
    }

    const author = json.authorId as
      | {
          id?: string;
          _id?: { toString(): string };
          displayName?: string;
          username?: string;
          avatarUrl?: string;
        }
      | undefined;

    if (author && typeof author === 'object') {
      json.author = {
        id: author.id ?? author._id?.toString(),
        displayName: author.displayName,
        username: author.username,
        avatarUrl: author.avatarUrl,
      };
    }

    delete json.authorId;
    return json;
  }

  private toModerationArticle(article: ArticleDocument) {
    this.applyFigureLayoutToArticle(article);

    const json = article.toJSON() as Record<string, unknown>;
    const author = json.authorId as
      | {
          id?: string;
          _id?: { toString(): string };
          displayName?: string;
          username?: string;
          avatarUrl?: string;
          email?: string;
        }
      | undefined;

    if (author && typeof author === 'object') {
      json.author = {
        id: author.id ?? author._id?.toString(),
        displayName: author.displayName,
        username: author.username,
        avatarUrl: author.avatarUrl,
        email: author.email,
      };
    }

    delete json.authorId;

    this.mapCategories(json);

    if (!json.excerpt && typeof json.contentHtml === 'string') {
      json.excerpt = extractExcerpt(json.contentHtml);
    }

    if (!json.coverImageUrl && typeof json.contentHtml === 'string') {
      json.coverImageUrl = extractCoverImage(json.contentHtml);
    }

    return json;
  }

  private emptyHomepageLayout(mode: 'popular' | 'forYou') {
    return {
      algorithm: mode,
      layout: {
        hero: null,
        leftLead: [],
        centerList: [],
        editorChoice: null,
        centerFill: [],
        latest: [],
        urgentLead: null,
        urgentGrid: [],
        showcase: [],
        lowerGrid: [],
      },
      feed: {
        articles: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
      },
    };
  }

  private enrichLayoutCandidates(
    articles: Array<LayoutArticle & { contentHtml?: string }>,
  ) {
    for (const article of articles) {
      if (!article.coverImageUrl && article.contentHtml) {
        article.coverImageUrl = extractCoverImage(article.contentHtml);
      }
      if (!article.excerpt && article.contentHtml) {
        article.excerpt = extractExcerpt(article.contentHtml);
      }
    }
  }

  private collectLayoutArticleIds(layout: Record<string, LayoutArticle[]>) {
    const ids: Types.ObjectId[] = [];
    const seen = new Set<string>();

    for (const articles of Object.values(layout)) {
      for (const article of articles) {
        const id = String(article._id ?? article.id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(new Types.ObjectId(id));
      }
    }

    return ids;
  }

  private sortRankedArticles<T extends { article: { isPinned?: boolean; publishedAt?: Date; createdAt?: Date }; finalScore: number }>(
    ranked: T[],
    _mode: 'popular' | 'forYou',
  ) {
    return [...ranked].sort((a, b) => {
      if (Boolean(a.article.isPinned) !== Boolean(b.article.isPinned)) {
        return a.article.isPinned ? -1 : 1;
      }

      if (b.finalScore !== a.finalScore) {
        return b.finalScore - a.finalScore;
      }

      const aDate = a.article.publishedAt ?? a.article.createdAt ?? new Date(0);
      const bDate = b.article.publishedAt ?? b.article.createdAt ?? new Date(0);
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }

  private toFeedArticle(article: ArticleDocument) {
    const json = this.toPublicArticle(article) as Record<string, unknown>;
    if (typeof json.contentHtml === 'string') {
      json.previewText = extractExcerptWords(json.contentHtml, 50);
    }
    delete json.contentHtml;
    return json;
  }

  private isArticleNew(article: ArticleDocument) {
    const doc = article as ArticleDocument & { createdAt?: Date };
    const reference = article.publishedAt ?? doc.createdAt;
    if (!reference) return false;

    const ageMs = Date.now() - new Date(reference).getTime();
    return ageMs >= 0 && ageMs <= NEW_ARTICLE_HOURS * 60 * 60 * 1000;
  }

  private mapCategories(json: Record<string, unknown>) {
    const raw = json.categoryIds;

    if (!Array.isArray(raw)) {
      json.categories = [];
      delete json.categoryIds;
      return;
    }

    json.categories = raw
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const category = item as {
          id?: string;
          _id?: { toString(): string };
          name?: string;
          slug?: string;
        };

        return {
          id: category.id ?? category._id?.toString(),
          name: category.name,
          slug: category.slug,
        };
      });

    delete json.categoryIds;
  }

  private toAuthorArticle(article: ArticleDocument) {
    const json = article.toJSON() as Record<string, unknown>;

    if (!json.excerpt && typeof json.contentHtml === 'string') {
      json.excerpt = extractExcerpt(json.contentHtml);
    }

    if (!json.coverImageUrl && typeof json.contentHtml === 'string') {
      json.coverImageUrl = extractCoverImage(json.contentHtml);
    }

    delete json.contentJson;
    return json;
  }

  private toPublicArticle(
    article: ArticleDocument,
    options?: { includeContentJson?: boolean },
  ) {
    const json = article.toJSON() as Record<string, unknown>;
    const author = json.authorId as
      | {
          id?: string;
          _id?: { toString(): string };
          displayName?: string;
          username?: string;
          avatarUrl?: string;
          bio?: string;
        }
      | undefined;

    if (author && typeof author === 'object') {
      json.author = {
        id: author.id ?? author._id?.toString(),
        displayName: author.displayName,
        username: author.username,
        avatarUrl: author.avatarUrl,
        bio: author.bio,
      };
    }

    delete json.authorId;
    if (!options?.includeContentJson) {
      delete json.contentJson;
    }

    this.mapCategories(json);
    json.isNew = this.isArticleNew(article);

    if (!json.excerpt && typeof json.contentHtml === 'string') {
      json.excerpt = extractExcerpt(json.contentHtml);
    }

    if (typeof json.contentHtml === 'string') {
      const imageUrls = extractImageUrls(json.contentHtml);
      json.imageUrls = imageUrls;

      if (!json.coverImageUrl && imageUrls.length > 0) {
        json.coverImageUrl = imageUrls[0];
      }
    }

    return json;
  }

  private syncFigureLayoutHtml(
    contentHtml: string,
    contentJson?: Record<string, unknown>,
  ) {
    if (!contentJson) return contentHtml;
    return syncFigureLayoutInHtml(contentHtml, contentJson);
  }

  private applyFigureLayoutToArticle(article: ArticleDocument) {
    if (!article.contentHtml || !article.contentJson) return;
    article.contentHtml = syncFigureLayoutInHtml(
      article.contentHtml,
      article.contentJson as Record<string, unknown>,
    );
  }

  private async ensureUniqueSlug(base: string, excludeId?: string) {
    let slug = base;
    let suffix = 0;

    while (true) {
      const query: Record<string, unknown> = { slug };
      if (excludeId) {
        query._id = { $ne: excludeId };
      }
      const exists = await this.articleModel.exists(query).exec();
      if (!exists) return slug;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }
  }
}
