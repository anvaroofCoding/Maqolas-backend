import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

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
