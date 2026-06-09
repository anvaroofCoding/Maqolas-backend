import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ArticlesModule } from '../articles/articles.module';
import { AiArticleController } from './ai-article.controller';
import { AiArticleService } from './ai-article.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import {
  AiArticleJob,
  AiArticleJobSchema,
} from './schemas/ai-article-job.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiArticleJob.name, schema: AiArticleJobSchema },
    ]),
    ArticlesModule,
  ],
  controllers: [AiController, AiArticleController],
  providers: [AiService, AiArticleService],
})
export class AiModule {}
