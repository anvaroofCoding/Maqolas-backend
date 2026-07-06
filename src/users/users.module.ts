import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AiArticleJob,
  AiArticleJobSchema,
} from '../ai/schemas/ai-article-job.schema';
import {
  ArticleRequest,
  ArticleRequestSchema,
} from '../article-requests/schemas/article-request.schema';
import {
  ArticleRequestLike,
  ArticleRequestLikeSchema,
} from '../article-requests/schemas/article-request-like.schema';
import { ArticlesModule } from '../articles/articles.module';
import {
  Article,
  ArticleSchema,
} from '../articles/schemas/article.schema';
import {
  ArticleBookmark,
  ArticleBookmarkSchema,
} from '../articles/schemas/article-bookmark.schema';
import {
  ArticleLike,
  ArticleLikeSchema,
} from '../articles/schemas/article-like.schema';
import {
  ArticleRead,
  ArticleReadSchema,
} from '../articles/schemas/article-read.schema';
import {
  Comment,
  CommentSchema,
} from '../articles/schemas/comment.schema';
import {
  CommentLike,
  CommentLikeSchema,
} from '../articles/schemas/comment-like.schema';
import { Ban, BanSchema } from '../moderation/schemas/ban.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  Notification,
  NotificationSchema,
} from '../notifications/schemas/notification.schema';
import { AuthModule } from '../auth/auth.module';
import { Pin, PinSchema } from '../pins/schemas/pin.schema';
import {
  PinComment,
  PinCommentSchema,
} from '../pins/schemas/pin-comment.schema';
import {
  PinCommentLike,
  PinCommentLikeSchema,
} from '../pins/schemas/pin-comment-like.schema';
import { PinLike, PinLikeSchema } from '../pins/schemas/pin-like.schema';
import {
  SavedPhrase,
  SavedPhraseSchema,
} from '../saved-phrases/schemas/saved-phrase.schema';
import {
  WelcomePromoComment,
  WelcomePromoCommentSchema,
} from '../welcome-promo/schemas/welcome-promo-comment.schema';
import {
  WelcomePromoCommentLike,
  WelcomePromoCommentLikeSchema,
} from '../welcome-promo/schemas/welcome-promo-comment-like.schema';
import { AccountDeletionService } from './account-deletion.service';
import { FollowsService } from './follows.service';
import {
  UserFollow,
  UserFollowSchema,
} from './schemas/user-follow.schema';
import { User, UserSchema } from './schemas/user.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UserFollow.name, schema: UserFollowSchema },
      { name: Article.name, schema: ArticleSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: CommentLike.name, schema: CommentLikeSchema },
      { name: ArticleLike.name, schema: ArticleLikeSchema },
      { name: ArticleBookmark.name, schema: ArticleBookmarkSchema },
      { name: ArticleRead.name, schema: ArticleReadSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: SavedPhrase.name, schema: SavedPhraseSchema },
      { name: WelcomePromoComment.name, schema: WelcomePromoCommentSchema },
      {
        name: WelcomePromoCommentLike.name,
        schema: WelcomePromoCommentLikeSchema,
      },
      { name: Pin.name, schema: PinSchema },
      { name: PinLike.name, schema: PinLikeSchema },
      { name: PinComment.name, schema: PinCommentSchema },
      { name: PinCommentLike.name, schema: PinCommentLikeSchema },
      { name: ArticleRequest.name, schema: ArticleRequestSchema },
      { name: ArticleRequestLike.name, schema: ArticleRequestLikeSchema },
      { name: AiArticleJob.name, schema: AiArticleJobSchema },
      { name: Ban.name, schema: BanSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => ArticlesModule),
    NotificationsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, FollowsService, AccountDeletionService],
  exports: [
    UsersService,
    FollowsService,
    AccountDeletionService,
    MongooseModule,
  ],
})
export class UsersModule {}
