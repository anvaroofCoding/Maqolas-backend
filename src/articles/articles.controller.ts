import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CreateCommentReportDto } from '../moderation/dto/create-comment-report.dto';
import { ModerationService } from '../moderation/moderation.service';
import { getClientIp } from '../moderation/utils/client-ip';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalCurrentUser } from '../auth/decorators/optional-current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';
import { ArticlesService } from './articles.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ListArticlesDto } from './dto/list-articles.dto';
import { ListMyArticlesDto } from './dto/list-my-articles.dto';
import { ListCommentsDto } from './dto/list-comments.dto';
import { SaveArticleDto } from './dto/save-article.dto';

@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly moderationService: ModerationService,
  ) {}

  @Get('feed')
  @UseGuards(OptionalJwtAuthGuard)
  async getFeed(
    @Query() query: ListArticlesDto,
    @OptionalCurrentUser() user: UserDocument | null = null,
  ) {
    return this.articlesService.findPublishedFeed(query, user?.id);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  async getMine(
    @CurrentUser() user: UserDocument,
    @Query() query: ListMyArticlesDto,
  ) {
    return this.articlesService.findByAuthor(user.id, query);
  }

  @Get('saved')
  @UseGuards(JwtAuthGuard)
  async getSaved(
    @CurrentUser() user: UserDocument,
    @Query() query: ListArticlesDto,
  ) {
    return this.articlesService.findSavedFeed(
      user.id,
      query.page,
      query.limit,
    );
  }

  @Get('slug/:slug')
  async getBySlug(@Param('slug') slug: string) {
    const article = await this.articlesService.findPublishedBySlug(slug);
    return { article };
  }

  @Get('comments/popular')
  @UseGuards(OptionalJwtAuthGuard)
  async getPopularComments(
    @Query('limit') limit?: string,
    @OptionalCurrentUser() user: UserDocument | null = null,
  ) {
    const parsedLimit = Math.min(Math.max(parseInt(limit ?? '5', 10) || 5, 1), 12);
    return this.articlesService.listPopularComments(parsedLimit, user?.id);
  }

  @Get(':id/engagement')
  @UseGuards(OptionalJwtAuthGuard)
  async getEngagement(
    @Param('id') id: string,
    @OptionalCurrentUser() user: UserDocument | null,
  ) {
    return this.articlesService.getEngagement(id, user?.id);
  }

  @Get(':id/comments')
  @UseGuards(OptionalJwtAuthGuard)
  async getComments(
    @Param('id') id: string,
    @Query() query: ListCommentsDto,
    @OptionalCurrentUser() user: UserDocument | null = null,
  ) {
    return this.articlesService.listComments(id, query, user?.id);
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  async toggleLike(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
  ) {
    return this.articlesService.toggleLike(id, user.id);
  }

  @Post(':id/save')
  @UseGuards(JwtAuthGuard)
  async toggleSave(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
  ) {
    return this.articlesService.toggleSave(id, user.id);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  async createComment(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @Req() req: Request,
  ) {
    return this.articlesService.createComment(
      id,
      user.id,
      dto,
      getClientIp(req),
    );
  }

  @Post(':id/comments/:commentId/report')
  @UseGuards(JwtAuthGuard)
  async reportComment(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() dto: CreateCommentReportDto,
    @Req() req: Request,
  ) {
    return this.moderationService.reportComment(
      id,
      commentId,
      user.id,
      getClientIp(req),
      dto.reason,
    );
  }

  @Delete(':id/comments/:commentId')
  @UseGuards(JwtAuthGuard)
  async deleteComment(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.articlesService.deleteComment(id, commentId, user.id);
  }

  @Post(':id/comments/:commentId/like')
  @UseGuards(JwtAuthGuard)
  async toggleCommentLike(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.articlesService.toggleCommentLike(id, commentId, user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: UserDocument,
    @Body() dto: SaveArticleDto,
  ) {
    const article = await this.articlesService.create(user.id, dto);
    return { article: article.toJSON() };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getOne(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
  ) {
    const article = await this.articlesService.findByIdForAuthor(id, user.id);
    return { article: article.toJSON() };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: SaveArticleDto,
  ) {
    const article = await this.articlesService.update(id, user.id, dto);
    return { article: article.toJSON() };
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard)
  async submit(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: SaveArticleDto,
  ) {
    const article = await this.articlesService.submitForReview(
      id,
      user.id,
      dto,
    );
    return { article: article.toJSON() };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
  ) {
    return this.articlesService.deleteByAuthor(id, user.id);
  }
}
