import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalCurrentUser } from '../auth/decorators/optional-current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';
import { ArticleRequestsService } from './article-requests.service';
import { CreateArticleRequestDto } from './dto/create-article-request.dto';
import { ListAllArticleRequestsDto } from './dto/list-all-article-requests.dto';
import { ListArticleRequestsDto } from './dto/list-article-requests.dto';
import { UpdateArticleRequestNoteDto } from './dto/update-article-request-note.dto';

@Controller('article-requests')
export class ArticleRequestsController {
  constructor(
    private readonly articleRequestsService: ArticleRequestsService,
  ) {}

  @Get('trending')
  @UseGuards(OptionalJwtAuthGuard)
  async listTrending(
    @Query('limit') limit?: string,
    @OptionalCurrentUser() user: UserDocument | null = null,
  ) {
    const parsedLimit = Math.min(Math.max(parseInt(limit ?? '5', 10) || 5, 1), 20);
    return this.articleRequestsService.listTrending(parsedLimit, user?.id);
  }

  @Get('all')
  @UseGuards(OptionalJwtAuthGuard)
  async listAll(
    @Query() query: ListAllArticleRequestsDto,
    @OptionalCurrentUser() user: UserDocument | null,
  ) {
    return this.articleRequestsService.listAll(query, user?.id);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async list(
    @Query() query: ListArticleRequestsDto,
    @OptionalCurrentUser() user: UserDocument | null,
  ) {
    return this.articleRequestsService.listByAuthor(query, user?.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: UserDocument,
    @Body() dto: CreateArticleRequestDto,
  ) {
    return this.articleRequestsService.create(user.id, dto);
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  async toggleLike(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
  ) {
    return this.articleRequestsService.toggleLike(id, user.id);
  }

  @Patch(':id/note')
  @UseGuards(JwtAuthGuard)
  async updateNote(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: UpdateArticleRequestNoteDto,
  ) {
    return this.articleRequestsService.updateAuthorNote(id, user.id, dto);
  }
}
