import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Response } from 'express';
import type { AppConfig } from '../config/configuration';
import { normalizeGoogleAvatarUrl } from '../users/avatar-url.util';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import type { GoogleAuthProfile } from './strategies/google.strategy';
import type {
  AuthResponse,
  AuthTokens,
  JwtPayload,
} from './interfaces/auth-tokens.interface';

const REFRESH_COOKIE = 'maqolas_refresh';
const ACCESS_COOKIE = 'maqolas_access';

function parseDurationToMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }

  const value = Number.parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {
    this.googleClient = new OAuth2Client(
      this.config.get('google.clientId', { infer: true }),
    );
  }

  async loginWithGoogleProfile(
    profile: GoogleAuthProfile,
    res?: Response,
  ): Promise<AuthResponse> {
    const user = await this.usersService.upsertFromGoogle(profile);
    const tokens = await this.issueTokens(user);

    if (res) {
      this.setAuthCookies(res, tokens);
    }

    return {
      user: user.toJSON() as AuthResponse['user'],
      ...tokens,
    };
  }

  async loginWithGoogleIdToken(
    idToken: string,
    res?: Response,
  ): Promise<AuthResponse> {
    const profile = await this.verifyGoogleIdToken(idToken);
    return this.loginWithGoogleProfile(profile, res);
  }

  async verifyGoogleIdToken(idToken: string): Promise<GoogleAuthProfile> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.config.get('google.clientId', { infer: true }),
      });

      const payload = ticket.getPayload();

      if (!payload?.sub || !payload.email) {
        throw new UnauthorizedException('Google token yaroqsiz');
      }

      return {
        googleId: payload.sub,
        email: payload.email,
        displayName:
          payload.name ?? payload.email.split('@')[0] ?? 'Foydalanuvchi',
        firstName: payload.given_name,
        lastName: payload.family_name,
        avatarUrl: normalizeGoogleAvatarUrl(payload.picture),
      };
    } catch {
      throw new UnauthorizedException('Google token tasdiqlanmadi');
    }
  }

  async refreshTokens(
    refreshToken: string,
    res?: Response,
  ): Promise<AuthTokens> {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get('jwt.refreshSecret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Refresh token yaroqsiz');
    }

    const user = await this.usersService.findByIdWithRefreshHash(payload.sub);

    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Sessiya tugagan');
    }

    const incomingHash = this.hashToken(refreshToken);

    if (!this.safeCompare(incomingHash, user.refreshTokenHash)) {
      throw new UnauthorizedException('Refresh token mos kelmadi');
    }

    const tokens = await this.issueTokens(user);

    if (res) {
      this.setAuthCookies(res, tokens);
    }

    return tokens;
  }

  async logout(userId: string, res?: Response) {
    await this.usersService.setRefreshTokenHash(userId, null);

    if (res) {
      this.clearAuthCookies(res);
    }

    return { success: true };
  }

  async logoutWithRefreshToken(refreshToken: string, res?: Response) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get('jwt.refreshSecret', { infer: true }),
      });

      return this.logout(payload.sub, res);
    } catch {
      if (res) {
        this.clearAuthCookies(res);
      }

      return { success: true };
    }
  }

  getGoogleAuthUrl(): string {
    const { clientId, callbackUrl } = this.config.get('google', {
      infer: true,
    });

    if (!clientId) {
      throw new BadRequestException('Google OAuth sozlanmagan');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  getFrontendRedirectUrl(query?: Record<string, string>) {
    const base = this.config.get('frontendUrl', { infer: true });
    const url = new URL('/auth/callback', base);

    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    return url.toString();
  }

  private async issueTokens(user: UserDocument): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get('jwt.accessSecret', { infer: true }),
        expiresIn: this.config.get('jwt.accessExpiresIn', { infer: true }),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get('jwt.refreshSecret', { infer: true }),
        expiresIn: this.config.get('jwt.refreshExpiresIn', { infer: true }),
      }),
    ]);

    await this.usersService.setRefreshTokenHash(
      user.id,
      this.hashToken(refreshToken),
    );

    return { accessToken, refreshToken };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private safeCompare(a: string, b: string) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  }

  setAuthCookies(res: Response, tokens: AuthTokens) {
    const isProd = this.config.get('nodeEnv', { infer: true }) === 'production';
    const accessMaxAge = parseDurationToMs(
      this.config.get('jwt.accessExpiresIn', { infer: true }),
    );
    const refreshMaxAge = parseDurationToMs(
      this.config.get('jwt.refreshExpiresIn', { infer: true }),
    );

    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: accessMaxAge,
      path: '/',
    });

    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: refreshMaxAge,
      path: '/api/auth',
    });
  }

  clearAuthCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  generateOAuthState() {
    return randomBytes(24).toString('hex');
  }
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
