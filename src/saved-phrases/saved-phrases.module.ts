import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Article, ArticleSchema } from '../articles/schemas/article.schema';
import { AuthModule } from '../auth/auth.module';
import { SavedPhrasesController } from './saved-phrases.controller';
import { SavedPhrasesService } from './saved-phrases.service';
import {
  SavedPhrase,
  SavedPhraseSchema,
} from './schemas/saved-phrase.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SavedPhrase.name, schema: SavedPhraseSchema },
      { name: Article.name, schema: ArticleSchema },
    ]),
    AuthModule,
  ],
  controllers: [SavedPhrasesController],
  providers: [SavedPhrasesService],
})
export class SavedPhrasesModule {}
