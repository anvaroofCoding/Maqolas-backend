import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { AppConfig } from '../config/configuration';
import { User, UserDocument } from '../users/schemas/user.schema';

type NewArticleEmailInput = {
  title: string;
  slug: string;
  excerpt?: string;
  authorDisplayName: string;
};

type CustomEmailInput = {
  subject: string;
  message: string;
  recipientMode: 'all' | 'selected';
  userIds?: string[];
};

type EmailRecipient = {
  email: string;
  displayName?: string;
};

export type WeeklyDigestArticle = {
  title: string;
  slug: string;
  excerpt?: string;
  authorDisplayName: string;
};

export type WeeklyDigestEmailInput = {
  topCategoryNames: string[];
  articles: WeeklyDigestArticle[];
};

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 500;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildArticleUrl(frontendUrl: string, slug: string) {
  const base = frontendUrl.replace(/\/+$/, '');
  const safeSlug = encodeURIComponent(slug);
  return `${base}/maqola/${safeSlug}`;
}

const linkStyle =
  'color:#1a1a1a;text-decoration:underline;text-underline-offset:2px;word-break:break-all;';

const emailBodyStyle =
  'margin:0 0 20px;font-size:16px;line-height:1.65;color:#1a1a1a;white-space:pre-wrap;';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  private getTransporter(): Transporter | null {
    if (this.transporter) {
      return this.transporter;
    }

    const emailConfig = this.config.get('email', { infer: true });
    if (!emailConfig.enabled) {
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host: emailConfig.smtpHost,
      port: emailConfig.smtpPort,
      secure: emailConfig.smtpSecure,
      auth: {
        user: emailConfig.smtpUser,
        pass: emailConfig.smtpPass,
      },
    });

    return this.transporter;
  }

  private buildCustomEmailHtml(message: string, recipientName?: string) {
    const greeting = recipientName
      ? `Salom, ${escapeHtml(recipientName)},`
      : 'Salom,';
    const paragraphs = message
      .trim()
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map(
        (block) =>
          `<p style="${emailBodyStyle}">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9f9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f7;">
    <tr>
      <td align="center" style="padding:48px 24px 64px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;">
          <tr>
            <td style="padding:0 0 40px;text-align:left;">
              <span style="font-size:18px;font-weight:700;letter-spacing:0.04em;color:#000000;text-transform:uppercase;">
                MAQOLAS
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:0;text-align:left;">
              <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#1a1a1a;">
                ${greeting}
              </p>
              ${paragraphs}
              <p style="margin:0;font-size:16px;line-height:1.65;color:#1a1a1a;">
                Siz bu xabarni Maqolas platformasiga ro'yxatdan o'tganingiz uchun oldingiz.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private async resolveRecipients(
    input: CustomEmailInput,
  ): Promise<EmailRecipient[]> {
    if (input.recipientMode === 'all') {
      return this.userModel
        .find({ email: { $exists: true, $ne: '' } })
        .select('email displayName')
        .lean()
        .exec();
    }

    const userIds = input.userIds ?? [];
    if (userIds.length === 0) {
      return [];
    }

    return this.userModel
      .find({ _id: { $in: userIds }, email: { $exists: true, $ne: '' } })
      .select('email displayName')
      .lean()
      .exec();
  }

  private async sendBatchEmails(
    recipients: EmailRecipient[],
    subject: string,
    buildHtml: (recipient: EmailRecipient) => string,
    buildText: (recipient: EmailRecipient) => string,
    logLabel: string,
  ) {
    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.warn(
        'Email yuborish o\'chirilgan: SMTP sozlamalari to\'liq emas',
      );
      return { sent: 0, failed: 0, total: recipients.length };
    }

    const emailConfig = this.config.get('email', { infer: true });

    if (recipients.length === 0) {
      return { sent: 0, failed: 0, total: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (recipient) => {
          try {
            await transporter.sendMail({
              from: `"Maqolas" <${emailConfig.from}>`,
              to: recipient.email,
              subject,
              html: buildHtml(recipient),
              text: buildText(recipient),
            });
            sent++;
          } catch (error) {
            failed++;
            this.logger.error(
              `Email yuborilmadi (${recipient.email}): ${error instanceof Error ? error.message : error}`,
            );
          }
        }),
      );

      if (i + BATCH_SIZE < recipients.length) {
        await this.delay(BATCH_DELAY_MS);
      }
    }

    this.logger.log(
      `${logLabel}: ${sent} yuborildi, ${failed} xato (${recipients.length} foydalanuvchi)`,
    );

    return { sent, failed, total: recipients.length };
  }

  async sendCustomEmails(input: CustomEmailInput) {
    const recipients = await this.resolveRecipients(input);

    if (input.recipientMode === 'selected' && recipients.length === 0) {
      return { sent: 0, failed: 0, total: 0 };
    }

    this.logger.log(
      `Admin email yuborilmoqda: "${input.subject}" → ${recipients.length} foydalanuvchi`,
    );

    return this.sendBatchEmails(
      recipients,
      input.subject.trim(),
      (recipient) =>
        this.buildCustomEmailHtml(input.message, recipient.displayName),
      (recipient) => {
        const greeting = recipient.displayName
          ? `Salom, ${recipient.displayName},`
          : 'Salom,';
        return [
          greeting,
          '',
          input.message.trim(),
          '',
          'Siz bu xabarni Maqolas platformasiga ro\'yxatdan o\'tganingiz uchun oldingiz.',
        ].join('\n');
      },
      'Admin email xabarlari',
    );
  }

  private buildNewArticleHtml(
    input: NewArticleEmailInput,
    articleUrl: string,
    recipientName?: string,
  ) {
    const title = escapeHtml(input.title);
    const author = escapeHtml(input.authorDisplayName);
    const excerpt = input.excerpt ? escapeHtml(input.excerpt) : '';
    const greeting = recipientName
      ? `Salom, ${escapeHtml(recipientName)},`
      : 'Salom,';

    const excerptItem = excerpt
      ? `<p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#1a1a1a;">
            <strong style="font-weight:700;">3. Qisqa mazmun.</strong> ${excerpt}
          </p>`
      : '';

    return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Yangi maqola: ${title}</title>
</head>
<body style="margin:0;padding:0;background:#f9f9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f7;">
    <tr>
      <td align="center" style="padding:48px 24px 64px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;">
          <tr>
            <td style="padding:0 0 40px;text-align:left;">
              <span style="font-size:18px;font-weight:700;letter-spacing:0.04em;color:#000000;text-transform:uppercase;">
                MAQOLAS
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:0;text-align:left;">
              <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#1a1a1a;">
                ${greeting}
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#1a1a1a;">
                Platformamizda yangi maqola nashr etildi. Quyidagi ma'lumotlar bilan tanishing:
              </p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#1a1a1a;">
                <strong style="font-weight:700;">Yangi maqola haqida</strong>
              </p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#1a1a1a;">
                <strong style="font-weight:700;">1. Sarlavha.</strong>
                <a href="${articleUrl}" style="${linkStyle}">${title}</a>
              </p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#1a1a1a;">
                <strong style="font-weight:700;">2. Muallif.</strong> ${author}
              </p>
              ${excerptItem}
              <p style="margin:0 0 12px;font-size:16px;line-height:1.65;color:#1a1a1a;">
                To'liq o'qish uchun
                <a href="${articleUrl}" style="${linkStyle}">${title}</a>
                maqolasini oching.
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#1a1a1a;">
                <a href="${articleUrl}" style="${linkStyle}">${escapeHtml(articleUrl)}</a>
              </p>
              <p style="margin:0;font-size:16px;line-height:1.65;color:#1a1a1a;">
                Siz bu xabarni Maqolas platformasiga ro'yxatdan o'tganingiz uchun oldingiz.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async notifyUsersAboutNewArticle(input: NewArticleEmailInput) {
    const publicSiteUrl = this.config.get('publicSiteUrl', { infer: true });
    const articleUrl = buildArticleUrl(publicSiteUrl, input.slug);

    this.logger.log(`Maqola email linki: ${articleUrl}`);

    const recipients = await this.userModel
      .find({ email: { $exists: true, $ne: '' } })
      .select('email displayName')
      .lean()
      .exec();

    if (recipients.length === 0) {
      this.logger.warn('Email yuborilmadi: ro\'yxatdan o\'tgan foydalanuvchi yo\'q');
      return;
    }

    this.logger.log(
      `Yangi maqola email xabarlari yuborilmoqda: "${input.title}" → ${recipients.length} foydalanuvchi`,
    );

    const subject = `Yangi maqola: ${input.title}`;

    await this.sendBatchEmails(
      recipients,
      subject,
      (user) =>
        this.buildNewArticleHtml(input, articleUrl, user.displayName),
      (user) => {
        const plainGreeting = user.displayName
          ? `Salom, ${user.displayName},`
          : 'Salom,';
        return [
          plainGreeting,
          '',
          'Platformamizda yangi maqola nashr etildi. Quyidagi ma\'lumotlar bilan tanishing:',
          '',
          'Yangi maqola haqida',
          '',
          `1. Sarlavha. ${input.title}`,
          `   ${articleUrl}`,
          `2. Muallif. ${input.authorDisplayName}`,
          input.excerpt ? `3. Qisqa mazmun. ${input.excerpt}` : '',
          '',
          `To'liq o'qish: ${articleUrl}`,
          '',
          'Siz bu xabarni Maqolas platformasiga ro\'yxatdan o\'tganingiz uchun oldingiz.',
        ]
          .filter(Boolean)
          .join('\n');
      },
      'Yangi maqola xabarlari',
    );
  }

  notifyUsersAboutNewArticleSafe(input: NewArticleEmailInput) {
    void this.notifyUsersAboutNewArticle(input).catch((error) => {
      this.logger.error(
        `Yangi maqola email xabarlari yuborilmadi: ${error instanceof Error ? error.message : error}`,
      );
    });
  }

  private buildWeeklyDigestHtml(
    input: WeeklyDigestEmailInput,
    recipientName: string | undefined,
    publicSiteUrl: string,
  ) {
    const greeting = recipientName
      ? `Salom, ${escapeHtml(recipientName)},`
      : 'Salom,';
    const categoryLine =
      input.topCategoryNames.length > 0
        ? escapeHtml(input.topCategoryNames.join(', '))
        : 'siz ko\'proq o\'qiydigan mavzular';

    const articleItems = input.articles
      .map((article, index) => {
        const articleUrl = buildArticleUrl(publicSiteUrl, article.slug);
        const title = escapeHtml(article.title);
        const author = escapeHtml(article.authorDisplayName);
        const excerpt = article.excerpt
          ? ` ${escapeHtml(article.excerpt)}`
          : '';

        return `<p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#1a1a1a;">
          <strong style="font-weight:700;">${index + 1}. ${title}.</strong>
          Muallif: ${author}.${excerpt}
          <a href="${articleUrl}" style="${linkStyle}">O'qish</a>
        </p>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9f9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f7;">
    <tr>
      <td align="center" style="padding:48px 24px 64px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;">
          <tr>
            <td style="padding:0 0 40px;text-align:left;">
              <span style="font-size:18px;font-weight:700;letter-spacing:0.04em;color:#000000;text-transform:uppercase;">MAQOLAS</span>
            </td>
          </tr>
          <tr>
            <td style="padding:0;text-align:left;">
              <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#1a1a1a;">${greeting}</p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#1a1a1a;">
                Siz ko'proq qiziqadigan <strong style="font-weight:700;">${categoryLine}</strong> bo'yicha
                shu haftadagi yangi maqolalarni tanlab oldik:
              </p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#1a1a1a;">
                <strong style="font-weight:700;">Sizga tavsiya etilgan maqolalar</strong>
              </p>
              ${articleItems}
              <p style="margin:0;font-size:16px;line-height:1.65;color:#1a1a1a;">
                Bu xabar haftada bir marta yuboriladi. Ko'proq o'qigan mavzularingiz bo'yicha tavsiyalar yangilanadi.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  async sendWeeklyDigestEmail(
    recipient: EmailRecipient,
    input: WeeklyDigestEmailInput,
  ) {
    const transporter = this.getTransporter();
    if (!transporter) {
      return false;
    }

    const emailConfig = this.config.get('email', { infer: true });
    const publicSiteUrl = this.config.get('publicSiteUrl', { infer: true });
    const subject =
      input.topCategoryNames.length > 0
        ? `Haftalik tavsiya: ${input.topCategoryNames.join(', ')}`
        : 'Haftalik tavsiya: sizga mos yangi maqolalar';

    const plainGreeting = recipient.displayName
      ? `Salom, ${recipient.displayName},`
      : 'Salom,';
    const textArticles = input.articles
      .map((article, index) => {
        const articleUrl = buildArticleUrl(publicSiteUrl, article.slug);
        return `${index + 1}. ${article.title} — ${article.authorDisplayName}\n   ${articleUrl}`;
      })
      .join('\n\n');

    try {
      await transporter.sendMail({
        from: `"Maqolas" <${emailConfig.from}>`,
        to: recipient.email,
        subject,
        html: this.buildWeeklyDigestHtml(
          input,
          recipient.displayName,
          publicSiteUrl,
        ),
        text: [
          plainGreeting,
          '',
          input.topCategoryNames.length > 0
            ? `Siz ko'proq qiziqadigan ${input.topCategoryNames.join(', ')} bo'yicha yangi maqolalar:`
            : 'Sizga mos yangi maqolalar:',
          '',
          textArticles,
          '',
          'Bu xabar haftada bir marta yuboriladi.',
        ].join('\n'),
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Haftalik digest yuborilmadi (${recipient.email}): ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }
}
