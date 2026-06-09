import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalCurrentUser } from '../auth/decorators/optional-current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { getClientIp } from '../moderation/utils/client-ip';
import type { UserDocument } from '../users/schemas/user.schema';
import { CreatePromoCommentDto } from './dto/create-promo-comment.dto';
import { ListPromoCommentsDto } from './dto/list-promo-comments.dto';
import { WelcomePromoService } from './welcome-promo.service';

@Controller('welcome-promo')
export class WelcomePromoController {
  constructor(private readonly welcomePromoService: WelcomePromoService) {}

  @Get('active')
  getActive() {
    return this.welcomePromoService.getActive();
  }

  @Get(':id/comments')
  @UseGuards(OptionalJwtAuthGuard)
  getComments(
    @Param('id') id: string,
    @Query() query: ListPromoCommentsDto,
    @OptionalCurrentUser() user: UserDocument | null = null,
  ) {
    return this.welcomePromoService.listComments(id, query, user?.id);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  createComment(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: CreatePromoCommentDto,
    @Req() req: Request,
  ) {
    return this.welcomePromoService.createComment(
      id,
      user.id,
      dto,
      getClientIp(req),
    );
  }

  @Delete(':id/comments/:commentId')
  @UseGuards(JwtAuthGuard)
  deleteComment(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.welcomePromoService.deleteComment(id, commentId, user.id);
  }

  @Post(':id/comments/:commentId/like')
  @UseGuards(JwtAuthGuard)
  toggleCommentLike(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.welcomePromoService.toggleCommentLike(id, commentId, user.id);
  }
}
