import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserDocument } from '../../users/schemas/user.schema';

export const OptionalCurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserDocument | null => {
    const request = ctx.switchToHttp().getRequest<{ user?: UserDocument | null }>();
    return request.user ?? null;
  },
);
