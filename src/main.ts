import { configureDevTls } from './config/configure-dev-tls';

configureDevTls();

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';

function isDevOriginAllowed(origin: string, frontendUrl: string) {
  if (origin === frontendUrl) {
    return true;
  }

  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') {
      return false;
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    return (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
    );
  } catch {
    return false;
  }
}

function createCorsOrigin(frontendUrl: string, nodeEnv: string) {
  if (nodeEnv === 'production') {
    return frontendUrl;
  }

  return (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean | string) => void,
  ) => {
    if (!origin) {
      callback(null, frontendUrl);
      return;
    }

    if (isDevOriginAllowed(origin, frontendUrl)) {
      callback(null, origin);
      return;
    }

    callback(null, false);
  };
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);
  const config = app.get(ConfigService<AppConfig, true>);

  const { logGoogleOAuthConfig } = await import('./config/log-google-oauth.config');
  logGoogleOAuthConfig(config);

  app.setGlobalPrefix('api');

  const frontendUrl = config.get('frontendUrl', { infer: true });
  const nodeEnv = config.get('nodeEnv', { infer: true });
  const corsOrigin = createCorsOrigin(frontendUrl, nodeEnv);

  app.use('/uploads', (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (
      typeof origin === 'string' &&
      (nodeEnv === 'production'
        ? origin === frontendUrl
        : isDevOriginAllowed(origin, frontendUrl))
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = config.get('port', { infer: true });
  await app.listen(port);
}

void bootstrap();
