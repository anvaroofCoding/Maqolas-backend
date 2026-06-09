import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { bannerUploadOptions } from '../banners/banner-upload.config';
import { CreateBannerDto } from '../banners/dto/create-banner.dto';
import { UpdateBannerDto } from '../banners/dto/update-banner.dto';
import { BannersService } from '../banners/banners.service';
import { ArticleRequestsService } from '../article-requests/article-requests.service';
import { ListArticleRequestsModerationDto } from '../article-requests/dto/list-article-requests-moderation.dto';
import { RejectArticleRequestDto } from '../article-requests/dto/reject-article-request.dto';
import { ArticlesService } from '../articles/articles.service';
import { CategoriesService } from '../categories/categories.service';
import { CreateCategoryDto } from '../categories/dto/create-category.dto';
import { UpdateCategoryDto } from '../categories/dto/update-category.dto';
import type { UserDocument } from '../users/schemas/user.schema';
import { AdminUpdateArticleDto } from './dto/admin-update-article.dto';
import { ApproveArticleDto } from './dto/approve-article.dto';
import { PinArticleDto } from './dto/pin-article.dto';
import { CreateBanDto } from '../moderation/dto/create-ban.dto';
import {
  BatchCommentIdsDto,
  RejectCommentsDto,
} from '../moderation/dto/batch-comment-ids.dto';
import { ModerationService } from '../moderation/moderation.service';
import { RejectArticleDto } from './dto/reject-article.dto';
import { promoUploadOptions } from '../welcome-promo/promo-upload.config';
import { CreateWelcomePromoDto } from '../welcome-promo/dto/create-welcome-promo.dto';
import { UpdateWelcomePromoDto } from '../welcome-promo/dto/update-welcome-promo.dto';
import { WelcomePromoService } from '../welcome-promo/welcome-promo.service';

class ReviewQueueQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

class CommentModerationQueryDto extends ReviewQueueQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';
}

class ListReportsQueryDto extends ReviewQueueQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}

class ListUsersQueryDto extends ReviewQueueQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly articleRequestsService: ArticleRequestsService,
    private readonly categoriesService: CategoriesService,
    private readonly bannersService: BannersService,
    private readonly welcomePromoService: WelcomePromoService,
    private readonly moderationService: ModerationService,
  ) {}

  @Get('articles/review-queue')
  async getReviewQueue(@Query() query: ReviewQueueQueryDto) {
    return this.articlesService.findReviewQueue(query.page, query.limit);
  }

  @Get('articles/published')
  async getPublishedArticles(@Query() query: ReviewQueueQueryDto) {
    return this.articlesService.findPublishedForAdmin(query.page, query.limit);
  }

  @Get('articles/:id')
  async getArticle(@Param('id') id: string) {
    const article = await this.articlesService.findByIdForAdmin(id);
    return { article };
  }

  @Patch('articles/:id')
  async updateArticle(
    @Param('id') id: string,
    @Body() dto: AdminUpdateArticleDto,
  ) {
    const article = await this.articlesService.updateByAdmin(id, dto);
    return { article };
  }

  @Patch('articles/:id/pin')
  async pinArticle(@Param('id') id: string, @Body() dto: PinArticleDto) {
    const article = await this.articlesService.setPinned(id, dto.isPinned);
    return { article };
  }

  @Post('articles/:id/approve')
  async approveArticle(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: ApproveArticleDto,
  ) {
    const article = await this.articlesService.approveArticle(
      id,
      user.id,
      dto.categoryIds,
    );
    return { article };
  }

  @Post('articles/:id/reject')
  async rejectArticle(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: RejectArticleDto,
  ) {
    const article = await this.articlesService.rejectArticle(
      id,
      user.id,
      dto.reason,
    );
    return { article };
  }

  @Get('categories')
  async listCategories() {
    const categories = await this.categoriesService.findAll();
    return { categories };
  }

  @Post('categories')
  async createCategory(@Body() dto: CreateCategoryDto) {
    const category = await this.categoriesService.create(dto);
    return { category };
  }

  @Patch('categories/:id')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const category = await this.categoriesService.update(id, dto);
    return { category };
  }

  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }

  @Get('banners')
  async listBanners() {
    return this.bannersService.listAll();
  }

  @Post('banners')
  @UseInterceptors(FileInterceptor('image', bannerUploadOptions))
  async createBanner(
    @Body() dto: CreateBannerDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.bannersService.create(dto, file);
  }

  @Patch('banners/:id')
  @UseInterceptors(FileInterceptor('image', bannerUploadOptions))
  async updateBanner(
    @Param('id') id: string,
    @Body() dto: UpdateBannerDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.bannersService.update(id, dto, file);
  }

  @Delete('banners/:id')
  async deleteBanner(@Param('id') id: string) {
    return this.bannersService.remove(id);
  }

  @Get('welcome-promo')
  async listWelcomePromos() {
    return this.welcomePromoService.listAll();
  }

  @Post('welcome-promo')
  @UseInterceptors(FileInterceptor('image', promoUploadOptions))
  async createWelcomePromo(
    @Body() dto: CreateWelcomePromoDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.welcomePromoService.create(dto, file);
  }

  @Patch('welcome-promo/:id')
  @UseInterceptors(FileInterceptor('image', promoUploadOptions))
  async updateWelcomePromo(
    @Param('id') id: string,
    @Body() dto: UpdateWelcomePromoDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.welcomePromoService.update(id, dto, file);
  }

  @Delete('welcome-promo/:id')
  async deleteWelcomePromo(@Param('id') id: string) {
    return this.welcomePromoService.remove(id);
  }

  @Get('welcome-promo/comments')
  async listWelcomePromoComments(@Query() query: CommentModerationQueryDto) {
    return this.welcomePromoService.listCommentsForModeration(
      query.page,
      query.limit,
      query.status ?? 'pending',
    );
  }

  @Post('welcome-promo/comments/approve')
  async approveWelcomePromoComments(
    @CurrentUser() user: UserDocument,
    @Body() dto: BatchCommentIdsDto,
  ) {
    return this.welcomePromoService.approveComments(dto.commentIds, user.id);
  }

  @Post('welcome-promo/comments/reject')
  async rejectWelcomePromoComments(
    @CurrentUser() user: UserDocument,
    @Body() dto: RejectCommentsDto,
  ) {
    return this.welcomePromoService.rejectComments(
      dto.commentIds,
      user.id,
      dto.reason,
    );
  }

  @Post('welcome-promo/comments/delete')
  async deleteWelcomePromoComments(@Body() dto: BatchCommentIdsDto) {
    return this.welcomePromoService.deleteCommentsByAdmin(dto.commentIds);
  }

  @Get('reports')
  async listReports(@Query() query: ListReportsQueryDto) {
    return this.moderationService.listReports(
      query.page,
      query.limit,
      query.status,
    );
  }

  @Patch('reports/:id/dismiss')
  async dismissReport(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
  ) {
    return this.moderationService.dismissReport(id, user.id);
  }

  @Get('stats')
  async getPlatformStats() {
    return this.moderationService.getPlatformStats();
  }

  @Get('users')
  async listUsers(@Query() query: ListUsersQueryDto) {
    return this.moderationService.listUsers(
      query.page,
      query.limit,
      query.search,
    );
  }

  @Post('users/:id/ban')
  async banUser(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: CreateBanDto,
    @Query('reportId') reportId?: string,
  ) {
    return this.moderationService.banUser(id, user.id, dto, reportId);
  }

  @Delete('users/:id/ban')
  async unbanUser(@Param('id') id: string) {
    return this.moderationService.unbanUser(id);
  }

  @Post('bans/ip')
  async banIp(
    @CurrentUser() user: UserDocument,
    @Body() dto: CreateBanDto,
    @Query('reportId') reportId?: string,
  ) {
    return this.moderationService.banIp(user.id, dto, reportId);
  }

  @Delete('bans/ip/:ip')
  async unbanIp(@Param('ip') ip: string) {
    return this.moderationService.unbanIp(decodeURIComponent(ip));
  }

  @Get('comments')
  async listComments(@Query() query: CommentModerationQueryDto) {
    return this.moderationService.listCommentsForModeration(
      query.page,
      query.limit,
      query.status ?? 'pending',
    );
  }

  @Post('comments/approve')
  async approveComments(
    @CurrentUser() user: UserDocument,
    @Body() dto: BatchCommentIdsDto,
  ) {
    return this.moderationService.approveComments(dto.commentIds, user.id);
  }

  @Post('comments/reject')
  async rejectComments(
    @CurrentUser() user: UserDocument,
    @Body() dto: RejectCommentsDto,
  ) {
    return this.moderationService.rejectComments(
      dto.commentIds,
      user.id,
      dto.reason,
    );
  }

  @Post('comments/delete')
  async deleteComments(@Body() dto: BatchCommentIdsDto) {
    return this.moderationService.deleteCommentsByAdmin(dto.commentIds);
  }

  @Get('article-requests')
  async listArticleRequests(@Query() query: ListArticleRequestsModerationDto) {
    return this.articleRequestsService.listForModeration(query);
  }

  @Post('article-requests/:id/approve')
  async approveArticleRequest(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
  ) {
    return this.articleRequestsService.approveRequest(id, user.id);
  }

  @Post('article-requests/:id/reject')
  async rejectArticleRequest(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: RejectArticleRequestDto,
  ) {
    return this.articleRequestsService.rejectRequest(id, user.id, dto);
  }
}
