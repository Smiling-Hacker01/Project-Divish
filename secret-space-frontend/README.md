# Secret Space — Frontend (Web + Capacitor Android)

The Vite + React web client for The Secret Space. Designed mobile-first and wrapped via Capacitor to ship as an Android app too, sharing one codebase between the responsive PWA and the Android binary.

## Stack

| Layer | Choice |
|---|---|
| Build | Vite |
| UI framework | React 18 + TypeScript |
| Mobile shell | Capacitor 8 (Android only — iOS uses the separate Expo `secret-space-mobile` repo) |
| Component library | Radix UI primitives + MUI 7 (icons mostly) |
| Styling | Emotion (`@emotion/react`, `@emotion/styled`) |
| State / data | React Context + hooks; `axios` for HTTP, `socket.io-client` for realtime |
| Auth | JWT tokens persisted in `localStorage` (web) / Capacitor Preferences (native) |
| E2EE | Web Crypto API (browser-native — no JS crypto polyfill) |
| Push notifications | Capacitor Push Notifications plugin (Android FCM) |
| Biometric unlock | `@capgo/capacitor-native-biometric` for Vault |
| Camera / files | Capacitor Camera + Filesystem plugins |

## Quick start (web dev)

```bash
cd secret-space-frontend

# 1. Install deps
npm install

# 2. Point at your backend (defaults to localhost:3000 if unset)
echo "VITE_API_BASE_URL=http://localhost:3000/api" > .env.local

# 3. Run the dev server
npm run dev
```

Vite serves on `http://localhost:5173` by default. Hot-reload on save.

## Quick start (Android via Capacitor)

Once you have a working web build, you can wrap it as an Android app:

```bash
# 1. Build the web bundle into dist/
npm run build

# 2. Sync the bundle into the Capacitor Android project
npx cap sync android

# 3. Open the Android project in Android Studio
npx cap open android
```

From Android Studio, build + run on an emulator or USB-connected device. Subsequent JS-only changes only need:

```bash
npm run build && npx cap sync android
```

The native shell stays the same; only the bundled JS in `android/app/src/main/assets/public/` gets updated.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production Vite build → `dist/` |

There's no `preview` or `lint` script currently — add them if needed.

## Project layout

```
src/
  main.tsx                 — Entry point, mounts <App />
  app/
    App.tsx                — Top-level providers + router
    routes.tsx             — React Router config
    screens/               — Page-level components (Home, Chat, Diary, Vault, Coupons, LoveBot, Settings, Auth flow)
    components/            — Shared UI (Avatar, Button, Card, Input, etc.)
    context/               — AuthContext, ThemeContext, ChatSocketContext
    api/                   — axios client + per-resource API modules
    services/              — encryption (Web Crypto), push notifications, cryptoIdentity, etc.
    types/                 — Shared TypeScript types matching the backend's response shapes
  imports/                 — Static asset imports (icons, illustrations)
  styles/                  — Global CSS / theme tokens
android/                   — Capacitor-generated Android Studio project (committed)
capacitor.config.ts        — Capacitor configuration
```

## Key architecture decisions

- **E2EE via Web Crypto.** The browser has SubtleCrypto natively, so RSA-OAEP-2048 keygen takes ~100 ms. No JS crypto polyfill needed. Wire format (SPKI public, PKCS#8 private, AES-GCM with 12-byte IV) is byte-identical to the mobile app's forge-based implementation — messages encrypted on one client decrypt on the other.
- **Capacitor for native, not React Native.** The web codebase is the same one that ships as the Android binary. Capacitor handles the WebView shell + native plugin bridge.
- **AuthContext owns the session.** Tokens persist across reloads via `localStorage` (or Capacitor Preferences on native); a single `apiClient` axios instance handles attaching the access token + transparently refreshing when it expires.
- **Socket.IO for realtime.** Connects after authentication; subscribes to the user's couple room for chat, presence, diary changes, coupon updates, and the `space_dissolved` event.

## Environment variables

```
VITE_API_BASE_URL         e.g., http://localhost:3000/api (dev) or https://project-divish.onrender.com/api (prod)
```

All other env vars are bundled into the build at compile time via Vite's `import.meta.env`.

## Deployment

The web build (`npm run build` → `dist/`) is a static SPA — host it on Vercel, Netlify, Cloudflare Pages, or any static host.

For the Android Capacitor build, follow the standard Android Studio signing + release flow. Use the same package ID and signing key across releases so Play Store treats updates as continuations rather than new apps.

For full deployment runbook (backend included), see [`../DEPLOYMENT.md`](../DEPLOYMENT.md).

## Relationship to `secret-space-mobile`

This repo and `../secret-space-mobile` are two different ways to ship the same app:

| | secret-space-frontend (this repo) | secret-space-mobile |
|---|---|---|
| Tech | Vite + React + Capacitor | Expo SDK 52 + React Native |
| Targets | Web (PWA) + Android (Capacitor WebView) | Android + iOS (native) |
| E2EE | Web Crypto (fast) | `node-forge` (slow JS, awaiting native-crypto migration) |

The backend treats them as identical clients — same API, same wire format, same Socket.IO events.

## License

See [`../LICENSE`](../LICENSE).
