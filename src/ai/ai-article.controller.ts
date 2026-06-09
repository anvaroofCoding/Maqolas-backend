import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';
import { AiArticleService } from './ai-article.service';
import { GenerateArticleDto } from './dto/generate-article.dto';

@Controller('ai/articles')
@UseGuards(JwtAuthGuard)
export class AiArticleController {
  constructor(private readonly aiArticleService: AiArticleService) {}

  @Get('quota')
  async getQuota(@CurrentUser() user: UserDocument) {
    return this.aiArticleService.getQuota(user.id);
  }

  @Get('active')
  async getActive(@CurrentUser() user: UserDocument) {
    return this.aiArticleService.getActiveJob(user.id);
  }

  @Get('archive')
  async listArchive(
    @CurrentUser() user: UserDocument,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.aiArticleService.listArchive(
      user.id,
      Math.max(1, Number(page) || 1),
      Math.min(50, Math.max(1, Number(limit) || 20)),
    );
  }

  @Get(':id')
  async getJob(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
  ) {
    return this.aiArticleService.getJob(user.id, id);
  }

  @Post('generate')
  async generate(
    @CurrentUser() user: UserDocument,
    @Body() body: GenerateArticleDto,
  ) {
    return this.aiArticleService.startGeneration(user.id, body.prompt);
  }
}
