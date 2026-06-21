import { Module } from '@nestjs/common';
import { ArticleRequestsModule } from '../article-requests/article-requests.module';
import { ArticlesModule } from '../articles/articles.module';
import { AuthModule } from '../auth/auth.module';
import { BannersModule } from '../banners/banners.module';
import { CategoriesModule } from '../categories/categories.module';
import { ModerationModule } from '../moderation/moderation.module';
import { EmailModule } from '../email/email.module';
import { WelcomePromoModule } from '../welcome-promo/welcome-promo.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    AuthModule,
    ArticlesModule,
    ArticleRequestsModule,
    CategoriesModule,
    BannersModule,
    WelcomePromoModule,
    ModerationModule,
    EmailModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
