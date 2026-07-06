import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AiArticleJob,
  AiArticleJobDocument,
} from '../ai/schemas/ai-article-job.schema';
import {
  ArticleRequest,
  ArticleRequestDocument,
} from '../article-requests/schemas/article-request.schema';
import {
  ArticleRequestLike,
  ArticleRequestLikeDocument,
} from '../article-requests/schemas/article-request-like.schema';
import {
  Article,
  ArticleDocument,
} from '../articles/schemas/article.schema';
import {
  ArticleBookmark,
  ArticleBookmarkDocument,
} from '../articles/schemas/article-bookmark.schema';
import {
  ArticleLike,
  ArticleLikeDocument,
} from '../articles/schemas/article-like.schema';
import {
  ArticleRead,
  ArticleReadDocument,
} from '../articles/schemas/article-read.schema';
import {
  Comment,
  CommentDocument,
} from '../articles/schemas/comment.schema';
import {
  CommentLike,
  CommentLikeDocument,
} from '../articles/schemas/comment-like.schema';
import { Ban, BanDocument } from '../moderation/schemas/ban.schema';
import {
  Notification,
  NotificationDocument,
} from '../notifications/schemas/notification.schema';
import { PushNotificationsService } from '../notifications/push-notifications.service';
import { Pin, PinDocument } from '../pins/schemas/pin.schema';
import {
  PinComment,
  PinCommentDocument,
} from '../pins/schemas/pin-comment.schema';
import {
  PinCommentLike,
  PinCommentLikeDocument,
} from '../pins/schemas/pin-comment-like.schema';
import { PinLike, PinLikeDocument } from '../pins/schemas/pin-like.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { rtTags } from '../realtime/realtime-tags';
import {
  SavedPhrase,
  SavedPhraseDocument,
} from '../saved-phrases/schemas/saved-phrase.schema';
import {
  WelcomePromoComment,
  WelcomePromoCommentDocument,
} from '../welcome-promo/schemas/welcome-promo-comment.schema';
import {
  WelcomePromoCommentLike,
  WelcomePromoCommentLikeDocument,
} from '../welcome-promo/schemas/welcome-promo-comment-like.schema';
import { User, UserDocument } from './schemas/user.schema';
import {
  UserFollow,
  UserFollowDocument,
} from './schemas/user-follow.schema';
import { UsersService } from './users.service';

@Injectable()
export class AccountDeletionService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Article.name)
    private readonly articleModel: Model<ArticleDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(CommentLike.name)
    private readonly commentLikeModel: Model<CommentLikeDocument>,
    @InjectModel(ArticleLike.name)
    private readonly articleLikeModel: Model<ArticleLikeDocument>,
    @InjectModel(ArticleBookmark.name)
    private readonly bookmarkModel: Model<ArticleBookmarkDocument>,
    @InjectModel(ArticleRead.name)
    private readonly articleReadModel: Model<ArticleReadDocument>,
    @InjectModel(UserFollow.name)
    private readonly followModel: Model<UserFollowDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(SavedPhrase.name)
    private readonly savedPhraseModel: Model<SavedPhraseDocument>,
    @InjectModel(WelcomePromoComment.name)
    private readonly promoCommentModel: Model<WelcomePromoCommentDocument>,
    @InjectModel(WelcomePromoCommentLike.name)
    private readonly promoCommentLikeModel: Model<WelcomePromoCommentLikeDocument>,
    @InjectModel(Pin.name)
    private readonly pinModel: Model<PinDocument>,
    @InjectModel(PinLike.name)
    private readonly pinLikeModel: Model<PinLikeDocument>,
    @InjectModel(PinComment.name)
    private readonly pinCommentModel: Model<PinCommentDocument>,
    @InjectModel(PinCommentLike.name)
    private readonly pinCommentLikeModel: Model<PinCommentLikeDocument>,
    @InjectModel(ArticleRequest.name)
    private readonly articleRequestModel: Model<ArticleRequestDocument>,
    @InjectModel(ArticleRequestLike.name)
    private readonly articleRequestLikeModel: Model<ArticleRequestLikeDocument>,
    @InjectModel(AiArticleJob.name)
    private readonly aiArticleJobModel: Model<AiArticleJobDocument>,
    @InjectModel(Ban.name)
    private readonly banModel: Model<BanDocument>,
    private readonly usersService: UsersService,
    private readonly pushNotifications: PushNotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async deleteAccount(userId: string, email: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (user.email !== normalizedEmail) {
      throw new BadRequestException('Email mos kelmadi');
    }

    if (user.role === 'super_admin') {
      throw new ForbiddenException('Super admin hisobi o\'chirilmaydi');
    }

    const userObjectId = new Types.ObjectId(userId);
    const username = user.username;

    const [articleIds, userCommentIds, userPinIds, userPromoCommentIds] =
      await Promise.all([
        this.articleModel.distinct('_id', { authorId: userObjectId }).exec(),
        this.commentModel.distinct('_id', { authorId: userObjectId }).exec(),
        this.pinModel.distinct('_id', { authorId: userObjectId }).exec(),
        this.promoCommentModel
          .distinct('_id', { authorId: userObjectId })
          .exec(),
      ]);

    const articleCommentsOnUserArticles = articleIds.length
      ? await this.commentModel
          .distinct('_id', { articleId: { $in: articleIds } })
          .exec()
      : [];

    const pinCommentsOnUserPins = userPinIds.length
      ? await this.pinCommentModel
          .distinct('_id', { pinId: { $in: userPinIds } })
          .exec()
      : [];

    const promoRepliesOnUserComments = userPromoCommentIds.length
      ? await this.promoCommentModel
          .distinct('_id', { parentId: { $in: userPromoCommentIds } })
          .exec()
      : [];

    const allCommentIds = [
      ...new Set([
        ...userCommentIds.map(String),
        ...articleCommentsOnUserArticles.map(String),
      ]),
    ].map((id) => new Types.ObjectId(id));

    const allPinCommentIds = [
      ...new Set(pinCommentsOnUserPins.map(String)),
    ].map((id) => new Types.ObjectId(id));

    const allPromoCommentIds = [
      ...new Set([
        ...userPromoCommentIds.map(String),
        ...promoRepliesOnUserComments.map(String),
      ]),
    ].map((id) => new Types.ObjectId(id));

    const requestIds = await this.articleRequestModel
      .distinct('_id', {
        $or: [{ requesterId: userObjectId }, { authorId: userObjectId }],
      })
      .exec();

    await Promise.all([
      allCommentIds.length
        ? this.commentLikeModel
            .deleteMany({ commentId: { $in: allCommentIds } })
            .exec()
        : Promise.resolve(),
      allPinCommentIds.length
        ? this.pinCommentLikeModel
            .deleteMany({ commentId: { $in: allPinCommentIds } })
            .exec()
        : Promise.resolve(),
      allPromoCommentIds.length
        ? this.promoCommentLikeModel
            .deleteMany({ commentId: { $in: allPromoCommentIds } })
            .exec()
        : Promise.resolve(),
      articleIds.length
        ? this.commentModel
            .deleteMany({ articleId: { $in: articleIds } })
            .exec()
        : Promise.resolve(),
      this.commentModel.deleteMany({ authorId: userObjectId }).exec(),
      articleIds.length
        ? this.articleLikeModel
            .deleteMany({ articleId: { $in: articleIds } })
            .exec()
        : Promise.resolve(),
      articleIds.length
        ? this.bookmarkModel
            .deleteMany({ articleId: { $in: articleIds } })
            .exec()
        : Promise.resolve(),
      this.articleModel.deleteMany({ authorId: userObjectId }).exec(),
      this.articleLikeModel.deleteMany({ userId: userObjectId }).exec(),
      this.bookmarkModel.deleteMany({ userId: userObjectId }).exec(),
      this.articleReadModel.deleteMany({ userId: userObjectId }).exec(),
      this.commentLikeModel.deleteMany({ userId: userObjectId }).exec(),
      this.followModel
        .deleteMany({
          $or: [{ followerId: userObjectId }, { followingId: userObjectId }],
        })
        .exec(),
      this.notificationModel
        .deleteMany({
          $or: [{ recipientId: userObjectId }, { actorId: userObjectId }],
        })
        .exec(),
      this.savedPhraseModel.deleteMany({ userId: userObjectId }).exec(),
      this.promoCommentLikeModel.deleteMany({ userId: userObjectId }).exec(),
      allPromoCommentIds.length
        ? this.promoCommentModel
            .deleteMany({ _id: { $in: allPromoCommentIds } })
            .exec()
        : Promise.resolve(),
      userPinIds.length
        ? this.pinLikeModel.deleteMany({ pinId: { $in: userPinIds } }).exec()
        : Promise.resolve(),
      userPinIds.length
        ? this.pinCommentModel
            .deleteMany({ pinId: { $in: userPinIds } })
            .exec()
        : Promise.resolve(),
      this.pinLikeModel.deleteMany({ userId: userObjectId }).exec(),
      this.pinModel.deleteMany({ authorId: userObjectId }).exec(),
      requestIds.length
        ? this.articleRequestLikeModel
            .deleteMany({ requestId: { $in: requestIds } })
            .exec()
        : Promise.resolve(),
      this.articleRequestLikeModel.deleteMany({ userId: userObjectId }).exec(),
      this.articleRequestModel
        .deleteMany({
          $or: [{ requesterId: userObjectId }, { authorId: userObjectId }],
        })
        .exec(),
      this.aiArticleJobModel.deleteMany({ userId: userObjectId }).exec(),
      this.banModel.deleteMany({ targetUserId: userObjectId }).exec(),
      this.pushNotifications.removeAllTokensForUser(userId),
    ]);

    this.usersService.removeAvatarFilesForUser(userId);
    await user.deleteOne();

    this.realtime.invalidate(
      [
        ...rtTags.authUser(),
        ...rtTags.userProfile(username),
        ...rtTags.articleFeed(),
        ...rtTags.articleMine(),
        ...rtTags.adminUsers(),
        ...rtTags.adminStats(),
        ...rtTags.notifications(),
      ],
      { userId, admin: true, public: true },
    );
    this.realtime.schedulePlatformStatsBroadcast();

    return { deleted: true };
  }
}
