/**
 * Google Client ID + Secret to'g'riligini tekshiradi.
 * invalid_grant = secret TO'G'RI | invalid_client = secret NOTO'G'RI
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

function loadEnv() {
  const text = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const client_id = env.GOOGLE_CLIENT_ID;
const client_secret = env.GOOGLE_CLIENT_SECRET;
const redirect_uri = env.GOOGLE_CALLBACK_URL;

if (!client_id || !client_secret) {
  console.error('GOOGLE_CLIENT_ID yoki GOOGLE_CLIENT_SECRET .env da yo\'q');
  process.exit(1);
}

console.log('Client ID:', client_id.slice(0, 20) + '...');
console.log('Secret oxirgi 4:', client_secret.slice(-4));
console.log('Callback:', redirect_uri);

const body = new URLSearchParams({
  code: 'test-invalid-code',
  client_id,
  client_secret,
  redirect_uri,
  grant_type: 'authorization_code',
});

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
});

const data = await res.json();
console.log('\nGoogle javobi:', JSON.stringify(data, null, 2));

if (data.error === 'invalid_client') {
  console.error('\n❌ Client ID yoki Client Secret NOTO\'G\'RI (.env ni Console bilan solishtiring)');
  process.exit(1);
}

if (data.error === 'invalid_grant') {
  console.log('\n✅ Client ID + Secret TO\'G\'RI (faqat auth code test uchun yaroqsiz — bu normal)');
  process.exit(0);
}

console.log('\n⚠️ Kutilmagan javob — qo\'lda tekshiring');
