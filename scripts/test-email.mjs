import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const smtpUser = (process.env.SMTP_USER ?? 'uzmaqolas@gmail.com').trim();
const smtpPass = (process.env.SMTP_PASS ?? '').trim().replace(/\s+/g, '');

if (!smtpPass) {
  console.error('SMTP_PASS .env faylida topilmadi');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: smtpUser, pass: smtpPass },
});

const to = process.argv[2] ?? smtpUser;

const sampleHtml = `<!DOCTYPE html>
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
              <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#1a1a1a;">Salom,</p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#1a1a1a;">Platformamizda yangi maqola nashr etildi. Quyidagi ma'lumotlar bilan tanishing:</p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#1a1a1a;"><strong style="font-weight:700;">Yangi maqola haqida</strong></p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#1a1a1a;"><strong style="font-weight:700;">1. Sarlavha.</strong> <a href="https://maqolas.tm2.uz/maqola/suniy-intellekt-va-kelajak" style="color:#1a1a1a;text-decoration:underline;text-underline-offset:2px;word-break:break-all;">Sun'iy intellekt va kelajak</a></p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#1a1a1a;"><strong style="font-weight:700;">2. Muallif.</strong> Islomjon Anvarov</p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#1a1a1a;"><strong style="font-weight:700;">3. Qisqa mazmun.</strong> Bu maqolada sun'iy intellektning zamonaviy dunyoga ta'siri haqida gap boradi.</p>
              <p style="margin:0 0 12px;font-size:16px;line-height:1.65;color:#1a1a1a;">To'liq o'qish uchun <a href="https://maqolas.tm2.uz/maqola/suniy-intellekt-va-kelajak" style="color:#1a1a1a;text-decoration:underline;text-underline-offset:2px;word-break:break-all;">Sun'iy intellekt va kelajak</a> maqolasini oching.</p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#1a1a1a;"><a href="https://maqolas.tm2.uz/maqola/suniy-intellekt-va-kelajak" style="color:#1a1a1a;text-decoration:underline;text-underline-offset:2px;word-break:break-all;">https://maqolas.tm2.uz/maqola/suniy-intellekt-va-kelajak</a></p>
              <p style="margin:0;font-size:16px;line-height:1.65;color:#1a1a1a;">Siz bu xabarni Maqolas platformasiga ro'yxatdan o'tganingiz uchun oldingiz.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

try {
  await transporter.verify();
  console.log('SMTP ulanish muvaffaqiyatli');

  const info = await transporter.sendMail({
    from: `"Maqolas" <${process.env.EMAIL_FROM ?? smtpUser}>`,
    to,
    subject: 'Yangi maqola: Sun\'iy intellekt va kelajak',
    text: 'Bu test xabari — yangi email dizayni.',
    html: sampleHtml,
  });

  console.log(`Email yuborildi: ${info.messageId} → ${to}`);
} catch (error) {
  console.error('Email testi xato:', error instanceof Error ? error.message : error);
  process.exit(1);
}
