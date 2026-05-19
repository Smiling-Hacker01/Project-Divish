# Secret Space — Mobile (Expo / React Native)

The native React Native + Expo client for The Secret Space — a private app for couples. Targets Android primarily; iOS-ready (build paths configured) but distribution gated on Apple Developer Program enrollment.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Expo SDK 52, React Native 0.76, TypeScript |
| Architecture | New Architecture enabled (`newArchEnabled: true`) — Fabric renderer + bridgeless |
| Navigation | React Navigation (native-stack + bottom-tabs) |
| Realtime | `socket.io-client` for chat, presence, diary/coupon broadcasts, space_dissolved |
| HTTP | `axios` with token-refresh interceptor |
| Persistence | `@react-native-async-storage/async-storage` (queues + cached user), `expo-secure-store` (RSA keypair) |
| Auth | JWT (access + refresh); face MFA via `expo-camera` + backend-side face-api descriptor matching |
| E2EE | `node-forge` (JS RSA-OAEP-1024 + AES-GCM-256) — wire-compatible with the web client's Web Crypto output |
| Push | Firebase Cloud Messaging via Expo's notification plugin |
| Camera / media | expo-camera, expo-image-picker, expo-image, expo-av |
| Biometrics | expo-local-authentication (Vault unlock) |
| Build / distribution | EAS Build, EAS Update (not yet configured), EAS Submit |
| Fonts | `@expo-google-fonts` — Fraunces (serif), Inter (sans), JetBrainsMono (mono) |

## Quick start

```bash
cd secret-space-mobile

# 1. Install deps
npm install

# 2. Point at a backend
#    For local dev: edit app.json → expo.extra.apiBaseUrl to your machine's LAN IP
#                   (e.g., http://192.168.1.10:3000/api) or your ngrok tunnel URL
#    For prod: keep it pointed at https://project-divish.onrender.com/api

# 3. Start Metro (you need a development build APK installed on your phone first — see below)
npx expo start --dev-client
```

Open the dev-client app on your device and scan the QR code. Every code save hot-reloads in ~2–5 seconds.

## Builds

This project uses **EAS Build** (Expo's cloud builder) — local Android Studio builds aren't required.

| Profile | Command | What it produces |
|---|---|---|
| `development` | `eas build --platform android --profile development` | Dev-client APK that connects to Metro. Install once, then iterate via `npx expo start --dev-client`. |
| `preview` | `eas build --platform android --profile preview` | Standalone signed APK with the production JS bundle baked in. For sharing with testers or sideloading. |
| `production` | `eas build --platform android --profile production` | AAB for Play Store distribution. Auto-increments version. |

iOS profiles are also defined (`eas.json`) but distribution requires Apple Developer Program enrollment ($99/year).

## Scripts

| Command | What it does |
|---|---|
| `npm start` | `expo start` — generic Metro launcher |
| `npm run android` | `expo run:android` — local native build + run on emulator (requires Android Studio + JDK) |
| `npm run ios` | `expo run:ios` — local iOS build + run on simulator (requires Xcode) |
| `npm run web` | `expo start --web` — runs the app in a web browser via React Native Web (limited fidelity) |
| `npm run typecheck` | `tsc --noEmit` — full TypeScript pass with no JS emit |

## Project layout

```
App.tsx                    — Root component. Wraps providers: SafeAreaProvider (with initialMetrics fallback), ThemeProvider, AuthProvider, ChatSocketProvider, Navigation
app.json                   — Expo config: bundle ID, plugins, icons, permissions, apiBaseUrl, EAS project link
eas.json                   — Build profiles (development, preview, production)

assets/
  icon.png                 — 1024×1024 launcher icon (rose + gold interlocking rings on dark)
  adaptive-icon-foreground.png — 1024×1024 Android adaptive foreground with safe-zone padding
  splash.png               — Splash screen

src/
  theme/                   — colors (dark + light), typography, spacing, shadows, ThemeProvider
  components/              — TopBar (fixed), InlineHeader (scrolling), ScreenContainer (deterministic safe-area), Button, Input, OTPInput, Card, GlassSurface, Avatar, Chip, BrandMark, BondHeart, ProgressBar, EmptyState, SegmentedControl, SwitchRow, Emoji
  api/                     — Typed API modules (auth, chat, diary, coupons, mood, lovebot, vault, settings, dashboard) + axios client with 401 → refresh-token retry
  context/
    AuthContext.tsx        — Session bootstrap, profile refresh, eager RSA keygen, push registration, logout (clears chatQueue + diaryQueue + keypair)
    ChatSocketContext.tsx  — Single Socket.IO connection, presence, unread count, listener fan-out for diary/coupon/space_dissolved events
  navigation/
    RootNavigator          — Auth-stack vs main-tabs split based on isAuthenticated
    MainTabs               — Floating bottom nav (FloatingTabBar) with Home/Diary/Coupons-overlay/LoveBot/Vault; hides on keyboard open
    AuthStack              — Welcome → Signup/Login → OTP → FaceEnroll → CoupleCode/JoinCode
    VaultStack             — VaultUnlock → VaultGrid
  screens/
    auth/                  — Login (mode-aware: email → method-pick → face/password/OTP), SignUp, OTP, FaceEnroll, CoupleCode, JoinCode, ForgotPassword, Splash
    home/                  — HomeScreen (bond visual, days-since, mood check-in, daily reason, quick tiles), MoodCheckInScreen
    chat/                  — ChatScreen (E2EE messaging, voice notes, media, reactions, edit/delete, presence)
    diary/                 — DiaryFeedScreen, DiaryCreateScreen, DiaryDetailScreen
    coupons/               — CouponsListScreen, CouponCreateScreen, CouponDetailScreen
    lovebot/               — LoveBotScreen, AddReasonScreen
    vault/                 — VaultUnlockScreen (password + biometric), VaultGridScreen (auto-resume uploads, paginated)
    settings/              — SettingsScreen, AboutScreen, ChangePasswordScreen, FaceReenrollScreen
    streak/                — DailyLoginScreen (transparent modal)
  services/                — encryption (forge), cryptoIdentity (SecureStore keypair), chatQueue, diaryQueue, vaultUploadManager (singleton), push (FCM registration + notification handler)
  types/                   — Shared TypeScript types matching backend responses
```

## Key architecture decisions

- **Deterministic safe-area handling.** `ScreenContainer` uses `useSafeAreaInsets()` + `Math.max(insets.top, StatusBar.currentHeight)` for synchronous, single-source-of-truth top inset. Bypasses `SafeAreaView`'s frame-aware logic which is unreliable on first render with `newArchEnabled`. Headers (`TopBar`, `InlineHeader`) render as plain children — no nested SafeAreaViews.
- **Two header components, deliberate split.** `TopBar` (fixed-position, hairline divider, opaque background) for Chat. `InlineHeader` (no background, lighter chrome) for everything else — tab landing screens, auth flows, settings. Chat's pinned partner-info row needs the fixed positioning that `InlineHeader` deliberately lacks.
- **Eager RSA keygen on auth.** Pure-JS forge keygen takes 15–30s on mid-tier Android. AuthContext fires `getOrCreateKeyPair()` the moment the user authenticates so the work overlaps with onboarding/Home/Diary navigation, and Chat is typically ready by the time the user taps it.
- **Idempotent offline queues.** `chatQueue` and `diaryQueue` (AsyncStorage-backed) hold pending writes with a `clientId`; backend's unique `(senderId/authorId, clientId)` indexes turn retries into no-ops. The vault upload manager has a similar per-entry state machine with `sessionInitiated` tracking so auto-resumed uploads don't trigger a "phantom progress" banner.
- **Pre-warm backend on app launch.** AuthContext bootstrap fires a fire-and-forget `GET /health` so a sleeping Render dyno starts spinning up while the splash is showing — by the time the user reaches any real screen, the backend is warm.
- **Brand mark as the launcher icon.** Icon PNGs are regenerated by `secret-space-backend/src/scripts/generate-icon.ts` using node-canvas — same brand colors as the in-app `BrandMark` component, so the launcher icon, splash, and in-app branding all match.

## Environment

The mobile app reads its backend URL from `app.json` → `expo.extra.apiBaseUrl`. There's no `.env` (Expo prefers static config). For local dev, edit `app.json` to point at your LAN IP or ngrok tunnel.

Other config that lives in `app.json`:
- Bundle ID: `com.divish.secretspace` (iOS + Android)
- EAS project ID: `e176f59a-6be9-45a0-9061-18b73c649e38`
- EAS owner: `smiling-hacker`

## Deployment

For the production-build runbook (EAS build commands, signing, distribution, push notification setup), see [`../DEPLOYMENT.md`](../DEPLOYMENT.md) at the project root.

## Relationship to `secret-space-frontend`

`../secret-space-frontend` is the web/Capacitor twin of this app — same product, same backend, same wire format, different rendering tech. The backend treats both clients identically.

## License

See [`../LICENSE`](../LICENSE).
