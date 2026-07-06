import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { CreateCommentReportDto } from '../moderation/dto/create-comment-report.dto';
import { ModerationService } from '../moderation/moderation.service';
import { getClientIp } from '../moderation/utils/client-ip';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalCurrentUser } from '../auth/decorators/optional-current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';
import { articleImageUploadOptions } from './article-image-upload.config';
import { ArticlesService } from './articles.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ListArticlesDto } from './dto/list-articles.dto';
import { ListMyArticlesDto } from './dto/list-my-articles.dto';
import { ListCommentsDto } from './dto/list-comments.dto';
import { SaveArticleDto } from './dto/save-article.dto';
import { SearchArticlesDto } from './dto/search-articles.dto';

@Controller('articles')
export class ArticlesController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly moderationService: ModerationService,
  ) {}

  @Get('homepage')
  @UseGuards(OptionalJwtAuthGuard)
  async getHomepage(
    @OptionalCurrentUser() user: UserDocument | null = null,
  ) {
    return this.articlesService.findHomepageLayout(user?.id);
  }

  @Get('feed')
  @UseGuards(OptionalJwtAuthGuard)
  async getFeed(
    @Query() query: ListArticlesDto,
    @OptionalCurrentUser() user: UserDocument | null = null,
  ) {
    return this.articlesService.findPublishedFeed(query, user?.id);
  }

  @Get('search')
  async search(@Query() query: SearchArticlesDto) {
    return this.articlesService.searchPublished(query);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  async getMine(
    @CurrentUser() user: UserDocument,
    @Query() query: ListMyArticlesDto,
  ) {
    return this.articlesService.findByAuthor(user.id, query);
  }

  @Get('mine/hashtag-suggestions')
  @UseGuards(JwtAuthGuard)
  async getHashtagSuggestions(@CurrentUser() user: UserDocument) {
    return this.articlesService.getHashtagSuggestions(user.id);
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

  @Get('sitemap')
  async getSitemap() {
    const entries = await this.articlesService.listPublishedForSitemap();
    return { entries };
  }

  @Get('slug/:slug/related')
  async getRelatedBySlug(
    @Param('slug') slug: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Math.min(Math.max(parseInt(limit ?? '6', 10) || 6, 1), 12);
    return this.articlesService.findRelatedBySlug(slug, parsedLimit);
  }

  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  async getBySlug(
    @Param('slug') slug: string,
    @Query('meta') meta?: string,
    @OptionalCurrentUser() user: UserDocument | null = null,
  ) {
    const article = await this.articlesService.findPublishedBySlug(slug, {
      trackView: meta !== '1',
      userId: user?.id,
    });
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

  @Post('upload-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', articleImageUploadOptions))
  uploadImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Rasm fayli yuborilmadi');
    }

    return {
      url: this.articlesService.buildUploadedImageUrl(file.filename),
    };
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
