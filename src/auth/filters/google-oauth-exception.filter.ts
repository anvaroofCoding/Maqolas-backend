import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AppConfig } from '../../config/configuration';

@Catch()
export class GoogleOAuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GoogleOAuthExceptionFilter.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{ url?: string }>();

    const isOAuthCallback = req.url?.includes('/auth/google/callback');

    const oauthCode =
      exception &&
      typeof exception === 'object' &&
      'code' in exception &&
      typeof (exception as { code: unknown }).code === 'string'
        ? (exception as { code: string }).code
        : null;

    if (isOAuthCallback) {
      const mongoCode =
        exception &&
        typeof exception === 'object' &&
        'code' in exception &&
        (exception as { code: number }).code === 40;

      if (mongoCode) {
        this.logger.error('MongoDB upsert xatosi (displayName conflict tuzatildi — serverni qayta ishga tushiring)', exception);
        const frontend = this.config.get('frontendUrl', { infer: true });
        const redirect = new URL('/auth/callback', frontend);
        redirect.searchParams.set('error', 'server_error');
        redirect.searchParams.set('message', 'Server xatosi. Backend qayta ishga tushirilganini tekshiring va qayta urinib ko\'ring.');
        return res.redirect(redirect.toString());
      }
    }

    if (isOAuthCallback && oauthCode) {
      this.logger.warn(`Google OAuth xatosi: ${oauthCode}`);

      const frontend = this.config.get('frontendUrl', { infer: true });
      const redirect = new URL('/auth/callback', frontend);
      redirect.searchParams.set('error', oauthCode);

      if (oauthCode === 'invalid_client') {
        redirect.searchParams.set(
          'message',
          'Google Client ID va Client Secret bir xil "Web application" clientidan bo\'lishi kerak. Console da yangi secret yarating va .env ga qo\'ying.',
        );
      }

      return res.redirect(redirect.toString());
    }

    const nestedOauthError =
      exception &&
      typeof exception === 'object' &&
      'oauthError' in exception
        ? (exception as { oauthError?: { code?: string; message?: string } })
            .oauthError
        : undefined;

    const nestedCode = nestedOauthError?.code ?? null;

    if (isOAuthCallback && nestedCode) {
      this.logger.warn(`Google OAuth ichki xatosi: ${nestedCode}`);

      const frontend = this.config.get('frontendUrl', { infer: true });
      const redirect = new URL('/auth/callback', frontend);
      redirect.searchParams.set('error', nestedCode);

      if (nestedCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        redirect.searchParams.set(
          'message',
          'SSL sertifikat xatosi. Backend ni qayta ishga tushiring (dev TLS sozlamasi qo\'llanadi).',
        );
      } else {
        redirect.searchParams.set(
          'message',
          'Google bilan ulanishda xatolik. Keyinroq qayta urinib ko\'ring.',
        );
      }

      return res.redirect(redirect.toString());
    }

    if (
      isOAuthCallback &&
      exception instanceof Error &&
      exception.message.includes('Failed to obtain access token')
    ) {
      const frontend = this.config.get('frontendUrl', { infer: true });
      const redirect = new URL('/auth/callback', frontend);
      redirect.searchParams.set('error', 'oauth_token_failed');
      redirect.searchParams.set(
        'message',
        'Google token olinmadi. Client ID/Secret va callback URL ni tekshiring.',
      );
      return res.redirect(redirect.toString());
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return res.status(status).json(exception.getResponse());
    }

    this.logger.error('Auth xatosi', exception);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        'Autentifikatsiya xatosi. Google sozlamalarini tekshiring.',
    });
  }
}
