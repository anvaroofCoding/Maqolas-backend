import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ArticlesModule } from '../articles/articles.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { FollowsService } from './follows.service';
import {
  UserFollow,
  UserFollowSchema,
} from './schemas/user-follow.schema';
import { User, UserSchema } from './schemas/user.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UserFollow.name, schema: UserFollowSchema },
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => ArticlesModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [UsersController],
  providers: [UsersService, FollowsService],
  exports: [UsersService, FollowsService, MongooseModule],
})
export class UsersModule {}
