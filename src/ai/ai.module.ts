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
import {
  AiChatThreadRecord,
  AiChatThreadRecordSchema,
} from './schemas/ai-chat-thread.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AiChatService } from './ai-chat.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiArticleJob.name, schema: AiArticleJobSchema },
      { name: AiChatThreadRecord.name, schema: AiChatThreadRecordSchema },
      { name: User.name, schema: UserSchema },
    ]),
    ArticlesModule,
  ],
  controllers: [AiController, AiArticleController],
  providers: [AiService, AiArticleService, AiChatService],
  exports: [AiChatService],
})
export class AiModule {}
