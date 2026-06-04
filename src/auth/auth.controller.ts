import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { GoogleTokenDto } from './dto/google-token.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  AuthService,
  REFRESH_COOKIE,
} from './auth.service';
import type { GoogleAuthProfile } from './strategies/google.strategy';
import type { UserDocument } from '../users/schemas/user.schema';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Brauzer redirect — Google OAuth boshlash */
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    return;
  }

  /** Google callback — foydalanuvchini yaratadi va frontendga yo'naltiradi */
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
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
  me(@CurrentUser() user: UserDocument) {
    return { user: user.toJSON() };
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
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: UserDocument,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(user.id, res);
  }
}
