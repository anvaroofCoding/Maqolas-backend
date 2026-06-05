import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../config/configuration';
import type { JwtPayload } from '../interfaces/auth-tokens.interface';
import { ModerationService } from '../../moderation/moderation.service';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly usersService: UsersService,
    private readonly moderationService: ModerationService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt.accessSecret', { infer: true }),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }

    const ban = await this.moderationService.findActiveBan(user.id);
    if (ban) {
      throw new ForbiddenException({
        message: ban.isPermanent
          ? 'Hisobingiz doimiy bloklangan'
          : 'Hisobingiz vaqtincha bloklangan',
        reason: ban.reason,
        expiresAt: ban.expiresAt ?? null,
        isPermanent: ban.isPermanent,
      });
    }

    return user;
  }
}
