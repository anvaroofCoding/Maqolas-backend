import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from './configuration';

export function logGoogleOAuthConfig(
  config: ConfigService<AppConfig, true>,
) {
  const logger = new Logger('GoogleOAuth');
  const { clientId, clientSecret, callbackUrl } = config.get('google', {
    infer: true,
  });
  const frontendUrl = config.get('frontendUrl', { infer: true });

  if (!clientId || !clientSecret) {
    logger.error(
      'GOOGLE_CLIENT_ID yoki GOOGLE_CLIENT_SECRET .env da yo\'q. Google kirish ishlamaydi.',
    );
    return;
  }

  const idOk = clientId.endsWith('.apps.googleusercontent.com');
  const secretOk = clientSecret.startsWith('GOCSPX-');

  logger.log(`Client ID: ${clientId.slice(0, 12)}... (${idOk ? 'format OK' : 'format shubhali'})`);
  logger.log(`Callback: ${callbackUrl}`);
  logger.log(
    `Client Secret: ${secretOk ? 'GOCSPX-... (format OK)' : 'NOTO\'G\'RI FORMAT'} | yuklangan oxirgi 4: ***${clientSecret.slice(-4)}`,
  );
  logger.log(
    'Agar .env o\'zgartirilgan bo\'lsa — serverni to\'liq qayta ishga tushiring (Ctrl+C, npm run start:dev)',
  );

  if (!secretOk) {
    logger.warn(
      'Web application Client Secret odatda GOCSPX- bilan boshlanadi. Desktop/ boshqa tur ishlatilmaganini tekshiring.',
    );
  }

  logger.log(
    'Google Console → Authorized redirect URIs: ' + callbackUrl,
  );
  logger.log(
    'Google Console → Authorized JavaScript origins: ' + frontendUrl,
  );
}
