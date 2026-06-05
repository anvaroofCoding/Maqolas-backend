import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  UserFollow,
  UserFollowSchema,
} from '../users/schemas/user-follow.schema';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import {
  ArticleBookmark,
  ArticleBookmarkSchema,
} from './schemas/article-bookmark.schema';
import {
  ArticleLike,
  ArticleLikeSchema,
} from './schemas/article-like.schema';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { Article, ArticleSchema } from './schemas/article.schema';
import { Comment, CommentSchema } from './schemas/comment.schema';
import {
  CommentLike,
  CommentLikeSchema,
} from './schemas/comment-like.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Article.name, schema: ArticleSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: CommentLike.name, schema: CommentLikeSchema },
      { name: ArticleLike.name, schema: ArticleLikeSchema },
      { name: ArticleBookmark.name, schema: ArticleBookmarkSchema },
      { name: Category.name, schema: CategorySchema },
      { name: User.name, schema: UserSchema },
      { name: UserFollow.name, schema: UserFollowSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => NotificationsModule),
    ModerationModule,
  ],
  controllers: [ArticlesController],
  providers: [ArticlesService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
