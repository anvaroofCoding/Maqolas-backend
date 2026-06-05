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
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { bannerUploadOptions } from '../banners/banner-upload.config';
import { CreateBannerDto } from '../banners/dto/create-banner.dto';
import { UpdateBannerDto } from '../banners/dto/update-banner.dto';
import { BannersService } from '../banners/banners.service';
import { ArticlesService } from '../articles/articles.service';
import { CategoriesService } from '../categories/categories.service';
import { CreateCategoryDto } from '../categories/dto/create-category.dto';
import { UpdateCategoryDto } from '../categories/dto/update-category.dto';
import type { UserDocument } from '../users/schemas/user.schema';
import { AdminUpdateArticleDto } from './dto/admin-update-article.dto';
import { ApproveArticleDto } from './dto/approve-article.dto';
import { PinArticleDto } from './dto/pin-article.dto';
import { CreateBanDto } from '../moderation/dto/create-ban.dto';
import { ModerationService } from '../moderation/moderation.service';
import { RejectArticleDto } from './dto/reject-article.dto';

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

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminController {
  constructor(
    private readonly articlesService: ArticlesService,
    private readonly categoriesService: CategoriesService,
    private readonly bannersService: BannersService,
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

  @Get('reports')
  async listReports(
    @Query() query: ReviewQueueQueryDto,
    @Query('status') status?: string,
  ) {
    return this.moderationService.listReports(query.page, query.limit, status);
  }

  @Patch('reports/:id/dismiss')
  async dismissReport(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
  ) {
    return this.moderationService.dismissReport(id, user.id);
  }

  @Get('users')
  async listUsers(
    @Query() query: ReviewQueueQueryDto,
    @Query('search') search?: string,
  ) {
    return this.moderationService.listUsers(query.page, query.limit, search);
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
}
