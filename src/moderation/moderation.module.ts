import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Article, ArticleSchema } from '../articles/schemas/article.schema';
import { Comment, CommentSchema } from '../articles/schemas/comment.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
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
      { name: Article.name, schema: ArticleSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [ModerationService],
  exports: [ModerationService, MongooseModule],
})
export class ModerationModule {}
