import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const silent =
      request.query.silent === '1' || request.query.silent === 'true';

    return {
      prompt: silent ? 'none' : 'select_account',
      accessType: 'offline',
    };
  }
}
