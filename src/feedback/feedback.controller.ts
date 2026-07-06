import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { ListFeedbackDto } from './dto/list-feedback.dto';
import { FeedbackService } from './feedback.service';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  async listApproved(@Query() query: ListFeedbackDto) {
    return this.feedbackService.listApproved(query.page, query.limit);
  }

  @Get('recent')
  async listRecent(@Query('limit') limit?: string) {
    const parsedLimit = Math.min(Math.max(parseInt(limit ?? '5', 10) || 5, 1), 12);
    return this.feedbackService.listRecentApproved(parsedLimit);
  }

  @Get('top')
  async listTop(@Query('limit') limit?: string) {
    const parsedLimit = Math.min(Math.max(parseInt(limit ?? '2', 10) || 2, 1), 12);
    return this.feedbackService.listTopApproved(parsedLimit);
  }

  @Get('stats')
  async getStats() {
    return this.feedbackService.getStats();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: UserDocument,
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.feedbackService.create(user.id, dto);
  }
}
