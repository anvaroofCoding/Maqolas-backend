export interface AppConfig {
  nodeEnv: string;
  port: number;
  frontendUrl: string;
  publicSiteUrl: string;
  publicBaseUrl: string;
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
  superAdminEmails: string[];
  geminiApiKey: string;
  email: {
    enabled: boolean;
    from: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass: string;
  };
  weeklyDigest: {
    enabled: boolean;
    cron: string;
    timezone: string;
    minDaysBetween: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '8000', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  publicSiteUrl: (
    process.env.PUBLIC_SITE_URL ??
    process.env.FRONTEND_URL ??
    'http://localhost:3000'
  ).trim(),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:8000',
  mongodbUri:
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/maqolas',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'change-me-access',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '365d',
  },
  google: {
    clientId: (process.env.GOOGLE_CLIENT_ID ?? '').trim(),
    clientSecret: (process.env.GOOGLE_CLIENT_SECRET ?? '').trim(),
    callbackUrl: (
      process.env.GOOGLE_CALLBACK_URL ??
      'http://localhost:8000/api/auth/google/callback'
    ).trim(),
  },
  superAdminEmails: (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  geminiApiKey: (process.env.GEMINI_API_KEY ?? '').trim(),
  email: (() => {
    const smtpUser = (process.env.SMTP_USER ?? 'uzmaqolas@gmail.com').trim();
    const smtpPass = (process.env.SMTP_PASS ?? '')
      .trim()
      .replace(/\s+/g, '');
    return {
      from: (process.env.EMAIL_FROM ?? 'uzmaqolas@gmail.com').trim(),
      smtpHost: (process.env.SMTP_HOST ?? 'smtp.gmail.com').trim(),
      smtpPort: parseInt(process.env.SMTP_PORT ?? '587', 10),
      smtpSecure: process.env.SMTP_SECURE === 'true',
      smtpUser,
      smtpPass,
      enabled: Boolean(smtpPass && smtpUser),
    };
  })(),
  weeklyDigest: {
    enabled: process.env.WEEKLY_DIGEST_ENABLED !== 'false',
    cron: (process.env.WEEKLY_DIGEST_CRON ?? '0 10 * * 0').trim(),
    timezone: (process.env.WEEKLY_DIGEST_TIMEZONE ?? 'Asia/Tashkent').trim(),
    minDaysBetween: parseInt(process.env.WEEKLY_DIGEST_MIN_DAYS ?? '7', 10),
  },
});
