import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Article, ArticleSchema } from '../articles/schemas/article.schema';
import { Comment, CommentSchema } from '../articles/schemas/comment.schema';
import {
  CommentLike,
  CommentLikeSchema,
} from '../articles/schemas/comment-like.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  UserFollow,
  UserFollowSchema,
} from '../users/schemas/user-follow.schema';
import { ModerationService } from './moderation.service';
import { Ban, BanSchema } from './schemas/ban.schema';
import {
  CommentReport,
  CommentReportSchema,
} from './schemas/comment-report.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CommentReport.name, schema: CommentReportSchema },
      { name: Ban.name, schema: BanSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: CommentLike.name, schema: CommentLikeSchema },
      { name: Article.name, schema: ArticleSchema },
      { name: User.name, schema: UserSchema },
      { name: UserFollow.name, schema: UserFollowSchema },
    ]),
    NotificationsModule,
  ],
  providers: [ModerationService],
  exports: [ModerationService, MongooseModule],
})
export class ModerationModule {}
