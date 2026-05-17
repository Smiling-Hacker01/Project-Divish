# The Secret Space — Production Deployment Guide

> A step-by-step runbook for taking the app from "running on free tier" to "production-ready on paid infrastructure." Follow this end-to-end the day you upgrade plans.

---

## Plan Recommendations

### Render — go with **Starter ($7/mo)**

| Plan | RAM | CPU | Sleep? | Verdict for us |
|---|---|---|---|---|
| Free | 512 MB | 0.1 shared | Yes, after 15 min | Current — fine for 2 users, breaks LoveBot when asleep |
| **Starter** | **512 MB** | **0.5 shared** | **No** | **Recommended.** Comfortable for up to ~100 users with our lazy-load setup |
| Standard | 2 GB | 1 dedicated | No | Overkill for now. Upgrade when you have >100 users or add memory-heavy features |
| Pro | 4 GB | 2 dedicated | No | Not needed at our scale |

**Why Starter over Standard:**
The only real concern at 512 MB is face-api.js + tfjs-node memory consumption. Once we lazy-load face models (done as part of the backend hygiene PR), idle RSS sits around 220 MB and peak around 420 MB. That fits Starter with ~90 MB of headroom. Standard would be wasted spend at our user count.

**When to upgrade to Standard ($25/mo):**
- You consistently see RAM usage >450 MB in Render metrics
- You add server-side image/video processing
- Active user count crosses ~100
- You start seeing the dyno restart on OOM (visible in Render logs)

### Railway — go with **Hobby ($5/mo)**

| Plan | Cost | Verdict |
|---|---|---|
| Trial | $0 | Currently active — has fixed credit cap |
| **Hobby** | **$5/mo + usage** | **Recommended.** $5 included credit covers our DB usage easily |
| Pro | $20/mo + usage | Overkill until we have hundreds of active users |

Our Postgres workload is light: a few writes per chat message, a few reads per app open. Hobby's $5 credit will cover months of this scale.

### Total monthly cost: $12 ($7 Render + $5 Railway)

---

## Pre-Deployment Checklist

Before you click "upgrade" on either dashboard, verify these are true:

- [ ] `main` branch has the latest merged work, including:
  - [ ] Backend hygiene PR (lazy-load face models, drop `migrate deploy` from start, gate debug endpoint)
  - [ ] Path B native crypto migration (mobile)
  - [ ] `secret-space-mobile/app.json` `extra.apiBaseUrl` points to `https://project-divish.onrender.com/api`
- [ ] All four new Prisma migrations are committed in `secret-space-backend/prisma/migrations/`
- [ ] You've successfully deployed the current commit on `main` to Render free tier (the build went green at least once)
- [ ] `.npmrc` exists in `secret-space-backend/` with `production=false`
- [ ] EAS is logged in as `smiling-hacker` (run `eas whoami` locally)

---

## Part 1 — Render Backend Upgrade

### Step 1.1 — Upgrade the service plan

1. Open Render dashboard → your `project-divish` service
2. Settings → Instance Type → select **Starter** → confirm
3. Wait for the plan switch to apply (usually instant; service may restart)

### Step 1.2 — Verify the service settings

Walk through Settings and confirm each value:

| Setting | Required Value |
|---|---|
| Branch | `main` |
| Auto-Deploy | `Yes` |
| Build Command | `npm install && npx prisma generate && npx prisma migrate deploy && npm run build` |
| Start Command | `node dist/server.js` |
| Health Check Path | `/health` |
| Root Directory | `secret-space-backend` |

> **Note:** If Start Command still says `prisma migrate deploy && node dist/server.js`, change it. The build command already runs migrations.

### Step 1.3 — Verify environment variables

In Environment → Environment Variables, confirm every one of these is set with production values:

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Railway Postgres connection | Copy from Railway dashboard after upgrade |
| `REDIS_URL` | Socket.IO adapter + vault tokens | Render-managed Redis or external |
| `JWT_SECRET` | Access token signing | Generate fresh — 32+ random bytes |
| `JWT_REFRESH_SECRET` | Refresh token signing | Different from `JWT_SECRET` |
| `CLOUDINARY_CLOUD_NAME` | Media uploads | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | Media uploads | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | Media uploads | From Cloudinary dashboard |
| `FIREBASE_PROJECT_ID` | Push notifications | From Firebase service account JSON |
| `FIREBASE_CLIENT_EMAIL` | Push notifications | From Firebase service account JSON |
| `FIREBASE_PRIVATE_KEY` | Push notifications | **See critical note below** |
| `SMTP_HOST` | OTP emails | e.g., `smtp.gmail.com` |
| `SMTP_PORT` | OTP emails | Usually `587` |
| `SMTP_USER` | OTP emails | Your sender email |
| `SMTP_PASS` | OTP emails | App password, not account password |
| `SMTP_FROM` | OTP emails | Display sender |
| `ALLOWED_ORIGINS` | CORS allowlist | Comma-separated list of web origins |
| `FACE_MATCH_THRESHOLD` | Face auth tolerance | Default `0.5` if unset |
| `NODE_ENV` | Mode flag | **Must be `production`** |

**Critical: `FIREBASE_PRIVATE_KEY` newlines**

The Firebase service account private key is a PEM block with embedded newlines. Render's UI does not preserve `\n` correctly across paste operations.

**Correct way:**
- Paste the key with literal `\n` in place of real newlines (one long single-line string)
- Our [firebase.ts:11](secret-space-backend/src/config/firebase.ts#L11) converts `\\n` → `\n` automatically

**Wrong way:**
- Pasting the raw multi-line key — Render will mangle it on save

**Verify:** after deploy, hit `GET https://project-divish.onrender.com/api/debug/push-test` with a valid JWT. The response should show `firebaseInitialized: true`. If this endpoint 404s in production (because we gated it), check the deploy log for `[Firebase] Admin SDK initialized successfully`.

### Step 1.4 — Trigger first paid-tier deploy

1. Click Manual Deploy → Deploy latest commit
2. Watch the build log:
   - `npm install` — should install 759 packages (with dev deps)
   - `npx prisma generate` — should report "Generated Prisma Client"
   - `npx prisma migrate deploy` — should report "No pending migrations" (or apply any new ones)
   - `npm run build` — should complete `tsc` with zero errors
   - Upload + deploy — green checkmark
3. Watch the runtime log for these in order:
   - `[DB] PostgreSQL connected via Prisma`
   - `[Redis] Connected` + `[Redis] Connection verified`
   - `[FaceService] Models loaded` — **wait, this should NOT appear at boot if lazy-load is correctly applied.** If it does, the lazy-load PR didn't ship.
   - `[Firebase] Admin SDK initialized successfully`
   - `[LoveBot] Cron job started (every minute)`
   - `[Server] Running on port 10000 (production)`

If any of those are missing, **stop and diagnose before proceeding.**

### Step 1.5 — Verify health check

In a browser or curl:
```
curl https://project-divish.onrender.com/health
```
Expected: `{"status":"ok","timestamp":"..."}` with HTTP 200.

If Render is configured with `Health Check Path: /health`, it auto-restarts the dyno on health check failure. With Starter (no sleep), this is your safety net for crashes.

---

## Part 2 — Railway Database Upgrade

### Step 2.1 — Upgrade plan

1. Railway dashboard → Project → Settings → Billing
2. Switch to **Hobby** plan ($5/mo)
3. Confirm the project doesn't get a new internal hostname (it usually doesn't — same `nozomi.proxy.rlwy.net` URL stays)

### Step 2.2 — Verify DATABASE_URL still works

The proxy URL should not change on upgrade, but always verify:

1. Railway → Postgres service → Connect tab → copy the public `DATABASE_URL`
2. Compare it to what's set in Render's environment vars
3. If different: update Render, redeploy

### Step 2.3 — Enable backups

Hobby includes automatic backups but they're not always on by default.

1. Railway → Postgres service → Settings → Backups
2. Enable daily snapshots
3. Set retention to 7 days minimum

### Step 2.4 — Verify connection pool headroom

Hobby allows ~100 Postgres connections. Our Prisma pool defaults to `num_cpus * 2 + 1` = 3 connections per Render instance. We're nowhere near the cap, but worth knowing the number.

---

## Part 3 — Mobile App Build & TestFlight

### Step 3.1 — Verify `secret-space-mobile/app.json`

Open the file and confirm:

```json
{
  "expo": {
    "owner": "smiling-hacker",
    "ios": {
      "bundleIdentifier": "com.divish.secretspace",
      "googleServicesFile": "./GoogleService-Info.plist"  // ← REQUIRED for iOS push
    },
    "android": {
      "package": "com.divish.secretspace",
      "googleServicesFile": "./google-services.json"
    },
    "extra": {
      "apiBaseUrl": "https://project-divish.onrender.com/api",
      "eas": {
        "projectId": "e176f59a-6be9-45a0-9061-18b73c649e38"
      }
    }
  }
}
```

**Critical iOS push setup (do this before the first iOS build):**

1. Apple Developer → Certificates, Identifiers & Profiles → Keys → create an APNs Auth Key (.p8 file)
2. Firebase Console → Project Settings → Cloud Messaging → Apple app configuration → upload the .p8 with your Team ID and Key ID
3. Firebase Console → Project Settings → General → Add iOS app for `com.divish.secretspace`
4. Download `GoogleService-Info.plist` → drop into `secret-space-mobile/` root
5. Add `"googleServicesFile": "./GoogleService-Info.plist"` to `expo.ios` in `app.json`

Without these, **iOS push notifications will silently fail.** Android push will still work.

### Step 3.2 — Verify EAS login

```bash
cd secret-space-mobile
eas whoami
```

Should print `smiling-hacker`. If it prints anything else, run `eas logout && eas login`.

### Step 3.3 — Build for iOS production

```bash
cd secret-space-mobile
eas build --platform ios --profile production
```

Expected: a build URL on Expo's dashboard. Build takes 30–40 minutes.

**While building**, prep your App Store Connect:

1. App Store Connect → My Apps → Create new app
   - Bundle ID: `com.divish.secretspace`
   - Name: `The Secret Space`
   - Primary language: English
2. App Information → fill required metadata
3. TestFlight → Internal Testing → create a group → add your Apple ID + your girlfriend's Apple ID

### Step 3.4 — Submit to TestFlight

Once build completes:

```bash
eas submit --platform ios --latest
```

This uploads the IPA to App Store Connect. After processing (~15 min on Apple's side), the build appears in TestFlight.

Add testers to the internal group → they get an email → install via TestFlight app on their iPhone.

### Step 3.5 — Build for Android (optional, for direct distribution)

If you want APKs to install directly (not via Play Store yet):

```bash
eas build --platform android --profile preview
```

This produces an APK you can sideload. For Play Store, use `--profile production` and `eas submit --platform android`.

---

## Part 4 — Post-Deployment Verification

Run through this checklist with both you and your girlfriend's devices after the new build is installed:

### Auth flow
- [ ] Fresh login works (face verification completes within ~5s)
- [ ] OTP email arrives within 1 minute
- [ ] Token refresh works (close app for an hour, reopen, no re-login)

### Chat
- [ ] Send a text message — partner receives within 1 second
- [ ] Send a photo — uploads to Cloudinary, partner sees thumbnail
- [ ] Send a voice note — encrypts client-side, partner can play
- [ ] Delivered/read receipts flip correctly
- [ ] Typing indicator works
- [ ] Send a message while partner is offline → partner gets push notification
- [ ] Edit a message — partner sees updated content
- [ ] Delete for everyone — both see message gone

### Diary
- [ ] Create a text entry — appears on partner's diary
- [ ] Create with photo + video — uploads + plays back
- [ ] Pagination on scroll works (50+ entries)

### Vault
- [ ] Pick photos from gallery → uploads complete, banner shows progress
- [ ] Failed uploads can be dismissed via × button
- [ ] Banner disappears once all uploads finish (no phantom progress)

### LoveBot
- [ ] Set delivery time to ~2 min in the future
- [ ] Wait for that time → partner receives push notification with a love note
- [ ] Verify the same reason isn't sent twice (Redis dedup working)

### Coupons
- [ ] Mint a coupon — partner sees it in their inbox
- [ ] Redeem → status flips through `requested` → `approved` → `redeemed`
- [ ] Try double-redeem from partner's side simultaneously → one succeeds with 409 to the other

### Push notifications
- [ ] iOS: receive a chat push while app is backgrounded
- [ ] iOS: receive a chat push while app is foregrounded (in-app banner or silent depending on settings)
- [ ] Android: same as above
- [ ] Tap notification → opens to correct screen (chat / home)

### Settings
- [ ] Avatar upload + delete works
- [ ] Change password flow with OTP completes
- [ ] Face re-enroll completes

### Memory check (Render dashboard)
- [ ] Idle RSS < 250 MB
- [ ] Peak RSS during testing < 450 MB
- [ ] No "Out of memory" entries in logs

If anything in this list fails, **do not invite outside testers yet.** Fix it first.

---

## Part 5 — Monitoring & Maintenance

### Daily for the first week
- Check Render → Metrics tab: any error spikes?
- Check Render → Logs: scan for `error` or `fatal` entries
- Check Railway → Postgres → Metrics: connection count steady?
- Check Firebase Console → Cloud Messaging: any failed sends?

### Weekly thereafter
- Review Render metrics for memory creep
- Review Railway DB size growth — if approaching plan limit, consider migration to dedicated instance
- Review Cloudinary usage — free tier is 25 GB storage, 25k transformations/month

### Monthly
- Rotate `JWT_SECRET` and `JWT_REFRESH_SECRET` (this logs everyone out — coordinate)
- Review Cloudinary spend
- Verify backups are happening on Railway (test restore quarterly)

---

## Part 6 — Rollback Procedure

### Backend rollback (Render)

1. Render dashboard → Deploys tab → find the last known-good deploy
2. Click "Rollback to this deploy"
3. Render builds nothing — re-uses the prior build artifact, ~30s
4. Verify `/health` returns 200 and runtime logs are clean

### Database rollback (Railway)

**Only do this for catastrophic data loss.** Not for "I deployed bad code."

1. Railway dashboard → Postgres → Backups → choose snapshot
2. Restore to a new database
3. Update `DATABASE_URL` on Render to point at the restored DB
4. Redeploy

**Migrations are forward-only.** Never roll back a Prisma migration on a live database. Always roll forward with a corrective migration.

### Mobile rollback (TestFlight)

1. TestFlight → Internal Testing → uncheck the bad build for testers
2. Re-enable the previous build
3. Testers get a notification to revert
4. Investigate, fix, re-submit

---

## Part 7 — Known Deferred Items

Things working but flagged for follow-up:

| Item | Where | When to address |
|---|---|---|
| RSA-1024 → RSA-2048 with key rotation | `secret-space-mobile/src/services/encryption.ts` | After Path B is stable for 2 weeks |
| Audio message E2EE on mobile | `secret-space-mobile/src/screens/chat/` | Before public launch |
| `/api/debug/push-test` endpoint exists | `secret-space-backend/src/app.ts:56` | Already gated to non-prod after backend hygiene PR |
| Background-safe vault uploads on iOS | `secret-space-mobile/src/services/vaultUploadManager.ts` | Before public launch |
| "Leave the space" Settings row has empty onPress | `secret-space-mobile/src/screens/settings/SettingsScreen.tsx` | Before public launch |
| LoveBot horizontal-scale dedup beyond Redis | `secret-space-backend/src/jobs/lovebot.cron.ts` | Only if we ever run multiple backend instances |
| Auto-expire coupons cron | Backend | When coupon volume grows |
| `react-native-quick-crypto` migration completed | Mobile | Done as part of Path B before this guide is followed |

---

## Part 8 — Future Scaling Guidance

### When you have 100+ active users

- Upgrade Render to Standard ($25/mo) — RAM headroom for socket connections
- Consider adding Sentry for error tracking (free tier covers small projects)
- Set up Render uptime alerts (built-in, free)

### When you have 1000+ active users

- Move from Railway proxy URL to Railway private networking (lower latency)
- Add a CDN in front of Cloudinary for media (Cloudflare is free)
- Consider splitting the backend: one service for HTTP, one for sockets (cleaner scaling)
- Add a proper APM (Datadog, New Relic, or open-source: Prometheus + Grafana)

### When you have 10,000+ active users

- Move off Render to AWS / GCP for cost control
- Move from Railway to RDS / managed Postgres
- Add read replicas for diary/chat history queries
- Consider event-driven architecture for cron-heavy work (LoveBot via SQS/Pub-Sub)

---

## Quick Reference: Production URLs & IDs

| What | Value |
|---|---|
| Backend public URL | `https://project-divish.onrender.com` |
| API base | `https://project-divish.onrender.com/api` |
| Health check | `https://project-divish.onrender.com/health` |
| iOS bundle ID | `com.divish.secretspace` |
| Android package | `com.divish.secretspace` |
| EAS owner | `smiling-hacker` |
| EAS project ID | `e176f59a-6be9-45a0-9061-18b73c649e38` |
| GitHub repo | `Smiling-Hacker01/Project-Divish` |
| Render service | `project-divish` |
| Railway DB host | `nozomi.proxy.rlwy.net:52252` |

---

## If something goes wrong

1. **Check the runtime log on Render first** — 90% of issues surface there
2. **Check the Railway Postgres logs** if you suspect a DB issue
3. **Try a redeploy** before assuming bad code — flaky network during deploy is common
4. **Don't panic-rollback** — read the error, understand what failed, then decide
5. **Never edit production data directly** unless you have a backup taken in the last 24h

Keep this file in the repo so future-you remembers exactly what was set up and why.
