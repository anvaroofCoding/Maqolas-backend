export interface AppConfig {
  nodeEnv: string;
  port: number;
  frontendUrl: string;
  mongodbUri: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '8000', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  mongodbUri:
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/maqolas',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'change-me-access',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ??
      'http://localhost:8000/api/auth/google/callback',
  },
});
