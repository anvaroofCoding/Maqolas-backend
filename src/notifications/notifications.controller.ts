import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import {
  RegisterPushTokenDto,
  RemovePushTokenDto,
} from './dto/register-push-token.dto';
import { NotificationsService } from './notifications.service';
import { PushNotificationsService } from './push-notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Post('push-token')
  async registerPushToken(
    @CurrentUser() user: UserDocument,
    @Body() body: RegisterPushTokenDto,
  ) {
    return this.pushNotificationsService.registerToken(user.id, body);
  }

  @Delete('push-token')
  async removePushToken(
    @CurrentUser() user: UserDocument,
    @Body() body: RemovePushTokenDto,
  ) {
    return this.pushNotificationsService.removeToken(user.id, body.token);
  }

  @Get()
  async list(
    @CurrentUser() user: UserDocument,
    @Query() query: ListNotificationsDto,
  ) {
    return this.notificationsService.listForUser(user.id, query);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: UserDocument) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: UserDocument) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Patch(':id/read')
  async markAsRead(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(id, user.id);
  }
}
