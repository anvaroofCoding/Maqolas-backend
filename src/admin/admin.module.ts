import { Module } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { AuthModule } from '../auth/auth.module';
import { BannersModule } from '../banners/banners.module';
import { CategoriesModule } from '../categories/categories.module';
import { ModerationModule } from '../moderation/moderation.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    AuthModule,
    ArticlesModule,
    CategoriesModule,
    BannersModule,
    ModerationModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
