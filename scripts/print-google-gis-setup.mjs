/**
 * Google One Tap uchun Console sozlamalarini chiqaradi.
 * Ishga tushirish: node scripts/print-google-gis-setup.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendEnv = resolve(__dirname, "..", ".env");
const frontendEnv = resolve(__dirname, "..", "..", "Maqolas-frontend", ".env.local");

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const be = loadEnv(backendEnv);
const fe = loadEnv(frontendEnv);
const clientId = fe.NEXT_PUBLIC_GOOGLE_CLIENT_ID || be.GOOGLE_CLIENT_ID || "";
const callback = be.GOOGLE_CALLBACK_URL || "http://localhost:8000/api/auth/google/callback";

const jsOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://maqolas.tm2.uz",
]);

if (fe.NEXT_PUBLIC_GOOGLE_GIS_ORIGINS) {
  for (const part of fe.NEXT_PUBLIC_GOOGLE_GIS_ORIGINS.split(",")) {
    const v = part.trim();
    if (v) jsOrigins.add(v);
  }
}

console.log("\n=== Google One Tap sozlash ===\n");
console.log("Client ID:", clientId || "(topilmadi)");
console.log("\n1. Oching: https://console.cloud.google.com/apis/credentials");
console.log("2. OAuth 2.0 Client IDs → Web application (yuqoridagi Client ID)");
console.log("\n3. Authorized JavaScript origins (har biri alohida qator):");
for (const origin of jsOrigins) {
  console.log("   •", origin);
}
console.log("\n4. Authorized redirect URIs:");
console.log("   •", callback);
console.log("\n5. SAVE → 2-3 daqiqa kuting → frontend qayta ishga tushiring");
console.log("\nXato: [GSI_LOGGER] origin is not allowed");
console.log("→ 3-qadamda joriy manzilingiz (masalan http://localhost:3000) yo'q\n");
