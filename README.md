# Maqolas Backend

NestJS + TypeScript + MongoDB backend. Google OAuth orqali ro'yxatdan o'tish va kirish.

## Talablar

- Node.js 20+
- MongoDB (local yoki Atlas)

## O'rnatish

```powershell
cd Maqolas-backend
copy .env.example .env
.\install.ps1
npm run start:dev
```

> **Eslatma:** `nest` CLI shart emas. `npm run start:dev` — `tsx` orqali ishlaydi.  
> Agar `npm install` SSL xatosi bersa, `.npmrc` da npmmirror registry ishlatiladi.

API: `http://localhost:8000/api`

## Google Cloud sozlash

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. **OAuth 2.0 Client ID** yarating (Web application)
3. **Authorized redirect URIs**: `http://localhost:8000/api/auth/google/callback`
4. **Authorized JavaScript origins**: `http://localhost:3000`
5. Client ID va Secret ni `.env` ga qo'ying

### `invalid_client` / Client secret invalid

- [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **OAuth 2.0 Client IDs** → **Web application** turini tanlang
- **Client ID** va **Client secret** bir xil clientdan bo'lishi kerak (secret yangilangan bo'lsa, eskisini ishlatmang)
- **Authorized redirect URIs** (aniq): `http://localhost:8000/api/auth/google/callback`
- **Authorized JavaScript origins**: `http://localhost:3000`
- `.env` da qo'shtirnoq bo'lmasin, bo'sh joy qolmasin
- O'zgartirgach: `npm run start:dev` ni qayta ishga tushiring

## Auth API

| Method | Endpoint | Tavsif |
|--------|----------|--------|
| `GET` | `/api/auth/google` | Brauzer OAuth redirect |
| `GET` | `/api/auth/google/callback` | Google callback |
| `POST` | `/api/auth/google/token` | `{ "idToken": "..." }` — SPA uchun |
| `GET` | `/api/auth/me` | Bearer token bilan joriy user |
| `POST` | `/api/auth/refresh` | Refresh token yangilash |
| `POST` | `/api/auth/logout` | Chiqish (Bearer) |

### POST `/api/auth/google/token`

```json
{
  "idToken": "GOOGLE_ID_TOKEN"
}
```

Javob:

```json
{
  "user": { "id": "...", "email": "...", "displayName": "..." },
  "accessToken": "...",
  "refreshToken": "..."
}
```
