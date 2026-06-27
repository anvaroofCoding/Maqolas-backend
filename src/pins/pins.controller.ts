import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalCurrentUser } from '../auth/decorators/optional-current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { getClientIp } from '../moderation/utils/client-ip';
import type { UserDocument } from '../users/schemas/user.schema';
import { CreatePinCommentDto } from './dto/create-pin-comment.dto';
import { CreatePinDto } from './dto/create-pin.dto';
import { ListPinCommentsDto } from './dto/list-pin-comments.dto';
import { ListPinsDto } from './dto/list-pins.dto';
import { pinImageUploadOptions } from './pin-image-upload.config';
import { PinsService } from './pins.service';

@Controller('pins')
export class PinsController {
  constructor(private readonly pinsService: PinsService) {}

  @Get('feed')
  @UseGuards(OptionalJwtAuthGuard)
  listFeed(
    @Query() query: ListPinsDto,
    @OptionalCurrentUser() user: UserDocument | null = null,
  ) {
    return this.pinsService.listFeed(query, user?.id);
  }

  @Get('sitemap')
  listSitemap() {
    return this.pinsService.listSitemap();
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: UserDocument, @Query() query: ListPinsDto) {
    return this.pinsService.listMine(user.id, query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', pinImageUploadOptions))
  create(
    @CurrentUser() user: UserDocument,
    @Body() dto: CreatePinDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.pinsService.create(user.id, dto, file);
  }

  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  findBySlug(
    @Param('slug') slug: string,
    @OptionalCurrentUser() user: UserDocument | null = null,
  ) {
    return this.pinsService.findBySlug(slug, user?.id);
  }

  @Get(':id/engagement')
  @UseGuards(OptionalJwtAuthGuard)
  getEngagement(
    @Param('id') id: string,
    @OptionalCurrentUser() user: UserDocument | null = null,
  ) {
    return this.pinsService.getEngagement(id, user?.id);
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  toggleLike(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.pinsService.toggleLike(id, user.id);
  }

  @Get(':id/comments')
  @UseGuards(OptionalJwtAuthGuard)
  listComments(
    @Param('id') id: string,
    @Query() query: ListPinCommentsDto,
    @OptionalCurrentUser() user: UserDocument | null = null,
  ) {
    return this.pinsService.listComments(id, query, user?.id);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  createComment(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: CreatePinCommentDto,
    @Req() req: Request,
  ) {
    return this.pinsService.createComment(id, user.id, dto, getClientIp(req));
  }

  @Delete(':id/comments/:commentId')
  @UseGuards(JwtAuthGuard)
  deleteComment(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.pinsService.deleteComment(id, commentId, user.id);
  }

  @Post(':id/comments/:commentId/like')
  @UseGuards(JwtAuthGuard)
  toggleCommentLike(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.pinsService.toggleCommentLike(id, commentId, user.id);
  }
}
