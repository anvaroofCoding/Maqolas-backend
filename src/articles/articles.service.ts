import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { AppConfig } from '../config/configuration';
import { Model, Types } from 'mongoose';
import { extractCoverImage, extractExcerpt } from './article.utils';
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
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  UserFollow,
  UserFollowDocument,
} from '../users/schemas/user-follow.schema';
import {
  buildPopularityAggregationStages,
  computeFinalFeedScore,
  FEED_RANKING,
  type UserInterestProfile,
} from './feed-ranking';

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
export class ArticlesService {
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
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(UserFollow.name)
    private readonly followModel: Model<UserFollowDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly moderationService: ModerationService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

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
    return { deleted: true };
  }

  async toggleSave(articleId: string, userId: string) {
    const article = await this.findPublishedArticleById(articleId);
    const existing = await this.bookmarkModel
      .findOne({ articleId: article._id, userId })
      .exec();

    if (existing) {
      await existing.deleteOne();
      return { saved: false };
    }

    await this.bookmarkModel.create({ articleId: article._id, userId });
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
      return article ? [this.toPublicArticle(article)] : [];
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

    return this.articleModel.create({
      title,
      slug,
      contentHtml: dto.contentHtml,
      contentJson: dto.contentJson,
      excerpt: extractExcerpt(dto.contentHtml),
      coverImageUrl: extractCoverImage(dto.contentHtml),
      status: dto.status ?? 'draft',
      authorId,
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

    article.contentHtml = dto.contentHtml;
    article.excerpt = extractExcerpt(dto.contentHtml);
    article.coverImageUrl = extractCoverImage(dto.contentHtml);
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
    return article;
  }

  async submitForReview(id: string, authorId: string, dto: SaveArticleDto) {
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

    article.contentHtml = dto.contentHtml;
    article.excerpt = extractExcerpt(dto.contentHtml);
    article.coverImageUrl = extractCoverImage(dto.contentHtml);
    if (dto.contentJson !== undefined) {
      article.contentJson = dto.contentJson;
    }

    article.status = 'review';
    article.submittedAt = new Date();
    article.reviewNote = undefined;
    article.reviewedAt = undefined;
    article.reviewedBy = undefined;

    await article.save();
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

    article.contentHtml = dto.contentHtml;
    article.excerpt = extractExcerpt(dto.contentHtml);
    article.coverImageUrl = extractCoverImage(dto.contentHtml);
    if (dto.contentJson !== undefined) {
      article.contentJson = dto.contentJson;
    }

    await article.save();
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
    return this.findModerationArticleById(id);
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

    void this.notificationsService.createSafe({
      recipientId: article.authorId.toString(),
      type: 'article_approved',
      message: `"${article.title}" maqolangiz tasdiqlandi va nashr etildi`,
      link: `/maqola/${article.slug}`,
      articleId: article.id,
    });

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

    const existing = await this.commentLikeModel
      .findOne({ commentId: comment._id, userId })
      .exec();

    if (existing) {
      await existing.deleteOne();
      comment.likeCount = Math.max(0, (comment.likeCount ?? 0) - 1);
      await comment.save();
      return { liked: false, likeCount: comment.likeCount };
    }

    await this.commentLikeModel.create({ commentId: comment._id, userId });
    comment.likeCount = (comment.likeCount ?? 0) + 1;
    await comment.save();
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
    if (commentIds.length === 0) {
      return new Set<string>();
    }

    const likes = await this.commentLikeModel
      .find({
        commentId: { $in: commentIds },
        userId,
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

    return this.findPopularFeed(params);
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
        const json = this.toPublicArticle(article) as Record<string, unknown>;
        delete json.contentHtml;
        return json;
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
      .map((article) => this.toPublicArticle(article));
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
      articles: articles.map((article) => this.toPublicArticle(article)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private async findPopularFeed(params: ListArticlesDto) {
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

    const [result] = await this.articleModel
      .aggregate([
        { $match: filter },
        ...buildPopularityAggregationStages(),
        { $sort: { isPinned: -1, popularityScore: -1, createdAt: -1 } },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }, { $project: { _id: 1 } }],
            total: [{ $count: 'count' }],
          },
        },
      ])
      .exec();

    const total = result?.total?.[0]?.count ?? 0;
    const articleIds = (result?.data ?? []).map(
      (item: { _id: Types.ObjectId }) => item._id,
    );

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

    const [likeCategories, commentCategories, bookmarkCategories, follows, likedAuthors, commentedAuthors] =
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

    const ranked = candidates
      .map((article) => ({
        article,
        finalScore: computeFinalFeedScore(article, profile, 'forYou'),
      }))
      .sort((a, b) => {
        if (Boolean(a.article.isPinned) !== Boolean(b.article.isPinned)) {
          return a.article.isPinned ? -1 : 1;
        }
        return b.finalScore - a.finalScore;
      });

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

  async findPublishedBySlug(slug: string, options?: { trackView?: boolean }) {
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

    return this.toPublicArticle(article);
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

  private toPublicArticle(article: ArticleDocument) {
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
    delete json.contentJson;

    this.mapCategories(json);
    json.isNew = this.isArticleNew(article);

    if (!json.excerpt && typeof json.contentHtml === 'string') {
      json.excerpt = extractExcerpt(json.contentHtml);
    }

    if (!json.coverImageUrl && typeof json.contentHtml === 'string') {
      json.coverImageUrl = extractCoverImage(json.contentHtml);
    }

    return json;
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
