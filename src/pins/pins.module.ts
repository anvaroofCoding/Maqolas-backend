import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Pin, PinSchema } from './schemas/pin.schema';
import { PinComment, PinCommentSchema } from './schemas/pin-comment.schema';
import {
  PinCommentLike,
  PinCommentLikeSchema,
} from './schemas/pin-comment-like.schema';
import { PinLike, PinLikeSchema } from './schemas/pin-like.schema';
import { PinsController } from './pins.controller';
import { PinsService } from './pins.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Pin.name, schema: PinSchema },
      { name: PinLike.name, schema: PinLikeSchema },
      { name: PinComment.name, schema: PinCommentSchema },
      { name: PinCommentLike.name, schema: PinCommentLikeSchema },
    ]),
    ModerationModule,
    NotificationsModule,
  ],
  controllers: [PinsController],
  providers: [PinsService],
  exports: [PinsService],
})
export class PinsModule {}
