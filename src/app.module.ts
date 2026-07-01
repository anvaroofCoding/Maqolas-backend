import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminModule } from './admin/admin.module';
import { BannersModule } from './banners/banners.module';
import { ArticleRequestsModule } from './article-requests/article-requests.module';
import { ArticlesModule } from './articles/articles.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import configuration, { type AppConfig } from './config/configuration';
import { EmailModule } from './email/email.module';
import { ImageProxyModule } from './image-proxy/image-proxy.module';
import { AiModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';
import { WelcomePromoModule } from './welcome-promo/welcome-promo.module';
import { RealtimeModule } from './realtime/realtime.module';
import { DigestModule } from './digest/digest.module';
import { PinsModule } from './pins/pins.module';
import { SavedPhrasesModule } from './saved-phrases/saved-phrases.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    RealtimeModule,
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
    EmailModule,
    ImageProxyModule,
    AiModule,
    WelcomePromoModule,
    DigestModule,
    PinsModule,
    SavedPhrasesModule,
  ],
})
export class AppModule {}
