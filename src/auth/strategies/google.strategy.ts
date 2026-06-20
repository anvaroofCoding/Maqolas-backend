import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import type { AppConfig } from '../../config/configuration';
import { normalizeGoogleAvatarUrl } from '../../users/avatar-url.util';

export interface GoogleAuthProfile {
  googleId: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService<AppConfig, true>) {
    const google = config.get('google', { infer: true });

    super({
      clientID: google.clientId,
      clientSecret: google.clientSecret,
      callbackURL: google.callbackUrl,
      scope: ['email', 'profile'],
      passReqToCallback: false,
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      return done(new Error('Google akkauntdan email olinmadi'), undefined);
    }

    const user: GoogleAuthProfile = {
      googleId: profile.id,
      email,
      displayName: profile.displayName || email.split('@')[0],
      firstName: profile.name?.givenName,
      lastName: profile.name?.familyName,
      avatarUrl: profile.photos?.[0]?.value
        ? normalizeGoogleAvatarUrl(profile.photos[0].value)
        : undefined,
    };

    done(null, user);
  }
}
