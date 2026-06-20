import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Model } from 'mongoose';
import { GoogleOAuthExceptionFilter } from './filters/google-oauth-exception.filter';
import type { Request, Response } from 'express';
import {
  Article,
  type ArticleDocument,
} from '../articles/schemas/article.schema';
import { CurrentUser } from './decorators/current-user.decorator';
import { GoogleTokenDto } from './dto/google-token.dto';
import { avatarUploadOptions } from '../users/avatar-upload.config';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { UsersService } from '../users/users.service';
import { FollowsService } from '../users/follows.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
import {
  AuthService,
  REFRESH_COOKIE,
} from './auth.service';
import type { GoogleAuthProfile } from './strategies/google.strategy';
import type { UserDocument } from '../users/schemas/user.schema';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly followsService: FollowsService,
    @InjectModel(Article.name)
    private readonly articleModel: Model<ArticleDocument>,
  ) {}

  private async getUserStats(userId: string) {
    const [articlesCount, followersCount] = await Promise.all([
      this.articleModel.countDocuments({ authorId: userId }).exec(),
      this.followsService.countFollowers(userId),
    ]);

    return { articlesCount, followersCount };
  }

  /** Brauzer redirect — Google OAuth boshlash */
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    return;
  }

  /** Google callback — foydalanuvchini yaratadi va frontendga yo'naltiradi */
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @UseFilters(GoogleOAuthExceptionFilter)
  async googleCallback(
    @Req() req: Request & { user: GoogleAuthProfile },
    @Res() res: Response,
  ) {
    const result = await this.authService.loginWithGoogleProfile(
      req.user,
      res,
    );

    const redirectUrl = this.authService.getFrontendRedirectUrl({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    return res.redirect(redirectUrl);
  }

  /** SPA / mobil — Google ID token bilan kirish */
  @Post('google/token')
  async googleToken(
    @Body() dto: GoogleTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.loginWithGoogleIdToken(dto.idToken, res);
  }

  /** Joriy foydalanuvchi */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: UserDocument) {
    const synced = await this.usersService.syncSuperAdminRole(user);

    return {
      user: synced.toJSON(),
      stats: await this.getUserStats(synced.id),
    };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @CurrentUser() user: UserDocument,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.usersService.updateProfile(user.id, dto);
    return {
      user: updated.toJSON(),
      stats: await this.getUserStats(updated.id),
    };
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar', avatarUploadOptions))
  async uploadAvatar(
    @CurrentUser() user: UserDocument,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Rasm fayli yuborilmadi');
    }

    this.usersService.removeAvatarFilesForUser(user.id, file.filename);
    const updated = await this.usersService.updateAvatar(user.id, file.filename);

    return {
      user: updated.toJSON(),
      stats: await this.getUserStats(updated.id),
    };
  }

  /** Access token yangilash */
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Body('refreshToken') bodyToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      bodyToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token topilmadi');
    }

    return this.authService.refreshTokens(refreshToken, res);
  }

  /** Chiqish */
  @Post('logout')
  @UseGuards(OptionalJwtAuthGuard)
  async logout(
    @CurrentUser() user: UserDocument | null,
    @Body('refreshToken') bodyToken: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (user) {
      return this.authService.logout(user.id, res);
    }

    const refreshToken =
      bodyToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);

    if (refreshToken) {
      return this.authService.logoutWithRefreshToken(refreshToken, res);
    }

    this.authService.clearAuthCookies(res);
    return { success: true };
  }
}
