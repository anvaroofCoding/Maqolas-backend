import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ModerationModule } from '../moderation/moderation.module';
import {
  WelcomePromo,
  WelcomePromoSchema,
} from './schemas/welcome-promo.schema';
import {
  WelcomePromoComment,
  WelcomePromoCommentSchema,
} from './schemas/welcome-promo-comment.schema';
import {
  WelcomePromoCommentLike,
  WelcomePromoCommentLikeSchema,
} from './schemas/welcome-promo-comment-like.schema';
import { WelcomePromoController } from './welcome-promo.controller';
import { WelcomePromoService } from './welcome-promo.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WelcomePromo.name, schema: WelcomePromoSchema },
      { name: WelcomePromoComment.name, schema: WelcomePromoCommentSchema },
      {
        name: WelcomePromoCommentLike.name,
        schema: WelcomePromoCommentLikeSchema,
      },
    ]),
    ModerationModule,
  ],
  controllers: [WelcomePromoController],
  providers: [WelcomePromoService],
  exports: [WelcomePromoService],
})
export class WelcomePromoModule {}
