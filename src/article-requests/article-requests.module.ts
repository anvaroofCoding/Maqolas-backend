import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ArticleRequestsController } from './article-requests.controller';
import { ArticleRequestsService } from './article-requests.service';
import {
  ArticleRequest,
  ArticleRequestSchema,
} from './schemas/article-request.schema';
import {
  ArticleRequestLike,
  ArticleRequestLikeSchema,
} from './schemas/article-request-like.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ArticleRequest.name, schema: ArticleRequestSchema },
      { name: ArticleRequestLike.name, schema: ArticleRequestLikeSchema },
    ]),
    AuthModule,
    UsersModule,
  ],
  controllers: [ArticleRequestsController],
  providers: [ArticleRequestsService],
})
export class ArticleRequestsModule {}
