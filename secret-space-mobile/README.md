# Secret Space Mobile (Expo)

A React Native + Expo + TypeScript redesign of The Secret Space, implementing the Expressive Liquid Glass design system from `STITCH_REDESIGN_PROMPT.md`.

## Stack
- Expo SDK 52, React Native 0.76, TypeScript
- React Navigation (native-stack + bottom-tabs)
- expo-blur, expo-linear-gradient, expo-camera, expo-image-picker, expo-local-authentication
- @expo-google-fonts (Fraunces, Inter, JetBrainsMono)
- socket.io-client (chat)
- axios + AsyncStorage (auth + token refresh)

## Wired to existing backend
Reads from `secret-space-backend` (Node/Express + Prisma). Configure the base URL in `app.json` under `expo.extra.apiBaseUrl` (defaults to `http://localhost:5050/api`).

For physical-device testing, use your machine's LAN IP (e.g., `http://192.168.1.10:5050/api`) so Expo Go can reach it.

## Run
```bash
cd secret-space-mobile
npm install
npx expo start
```
Scan the QR with Expo Go (iOS/Android). Make sure the backend is running.

## Folder layout
- `src/theme/` — colors, type, spacing, ThemeProvider (dark + light)
- `src/components/` — Button, Input, OTPInput, Card, GlassSurface, TopBar, Avatar, Chip, ProgressBar, EmptyState, BondHeart, BrandMark, SegmentedControl, SwitchRow, ScreenContainer
- `src/api/` — typed API modules (auth, dashboard, mood, diary, coupons, lovebot, vault, settings, chat) with token-refresh interceptor
- `src/context/AuthContext.tsx` — bootstrap, refreshProfile, logout
- `src/navigation/` — RootNavigator (auth/main split), MainTabs (floating glass nav), AuthStack, VaultStack
- `src/screens/` — 22 screens across auth/, home/, diary/, chat/, coupons/, lovebot/, vault/, settings/, streak/

## Design system reference
See `../STITCH_REDESIGN_PROMPT.md` for the full visual brief.
