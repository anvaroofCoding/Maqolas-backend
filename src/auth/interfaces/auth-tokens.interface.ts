import type { User } from '../../users/schemas/user.schema';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
}
