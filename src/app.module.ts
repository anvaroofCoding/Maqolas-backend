import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminModule } from './admin/admin.module';
import { BannersModule } from './banners/banners.module';
import { ArticleRequestsModule } from './article-requests/article-requests.module';
import { ArticlesModule } from './articles/articles.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import configuration, { type AppConfig } from './config/configuration';
import { ImageProxyModule } from './image-proxy/image-proxy.module';
import { AiModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';
import { WelcomePromoModule } from './welcome-promo/welcome-promo.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        uri: config.get('mongodbUri', { infer: true }),
      }),
    }),
    UsersModule,
    AuthModule,
    ArticlesModule,
    ArticleRequestsModule,
    CategoriesModule,
    BannersModule,
    AdminModule,
    NotificationsModule,
    ImageProxyModule,
    AiModule,
    WelcomePromoModule,
  ],
})
export class AppModule {}
