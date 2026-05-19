# Secret Space — Backend

Node + Express + Prisma backend powering The Secret Space — a private app for couples (encrypted chat, shared diary, vault, coupons, mood check-ins, daily love notes via LoveBot).

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node 22.x |
| HTTP | Express + Helmet + CORS + pino-http |
| DB | PostgreSQL via Prisma 5 (Neon in production, Docker locally) |
| Realtime | Socket.IO with `@socket.io/redis-adapter` for horizontal scale |
| Cache / queues | Redis (Upstash in production, Docker locally) |
| Auth | JWT (access + refresh), bcrypt password hashing, face descriptor MFA |
| Media | Cloudinary (chat media, diary attachments, avatars, vault files) |
| Email | Brevo HTTPS API (OTP delivery; bypasses Render's blocked SMTP ports) |
| Push | Firebase Admin SDK → FCM |
| Face recognition | `@tensorflow/tfjs-node` + `face-api.js` + `canvas` (lazy-loaded) |
| LLM | Google Gemini (`gemini-1.5-flash`) for auto-generated daily LoveBot reasons |
| Cron | `node-cron` every minute for LoveBot delivery |

## Quick start (local dev)

```bash
cd secret-space-backend

# 1. Install deps (.npmrc forces production=false so devDeps come in)
npm install

# 2. Start the local DB + Redis containers
docker compose up -d

# 3. Set env vars
cp .env.example .env
# Edit .env — fill in DATABASE_URL, REDIS_URL, BREVO_*, FIREBASE_*, CLOUDINARY_*, JWT_*, GEMINI_API_KEY

# 4. Apply migrations
npx prisma migrate deploy

# 5. Run dev server (auto-reloads on file changes)
npm run dev
```

Server boots on port `3000` and logs each stage:

```
[Firebase] Admin SDK initialized successfully
[Redis] Connected
[DB] PostgreSQL connected via Prisma
[Redis] Connection verified
[LoveBot] Cron job started (every minute)
[Server] Running on port 3000 (production)
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | ts-node-dev hot-reload on `src/server.ts` |
| `npm run build` | `prisma generate && tsc` — produces `dist/server.js` |
| `npm start` | Run the compiled bundle (used by Render) |
| `npm run db:migrate` | `prisma migrate dev` — create + apply a new migration locally |
| `npm run db:generate` | Regenerate the Prisma client after schema changes |
| `npm run db:studio` | Open Prisma Studio (DB browser) on localhost |
| `npm run db:reset` | Drop + reapply all migrations (destructive) |
| `npm run db:clean` | **Dev-only** wipe of users + couples + Redis app keys, with prod guards. Use `-- --yes` to skip confirmation prompt, `-- --seed` to insert demo users. Refuses to run when `NODE_ENV=production` or `DATABASE_URL` host looks managed. |

## Project layout

```
src/
  app.ts                   — Express app setup (middleware, routes, error handler)
  server.ts                — Boot sequence (validate config, connect DB/Redis, start cron, listen)
  config/                  — prisma, redis, firebase, logger
  controllers/             — Route handlers (auth, chat, diary, coupons, vault, settings, lovebot, mood, dashboard)
  routes/                  — Express routers, one per resource
  middlewares/             — verifyJWT, requireCouple, errorHandler, rate limiters, file upload (multer)
  services/                — face.service, storage.service, notification.service, loveReasonGenerator
  jobs/                    — lovebot.cron (auto-generates + delivers daily love notes)
  websockets/              — chat.gateway (Socket.IO event handlers, presence, receipts)
  utils/                   — jwt, otp, validators, userPopulator, coupleCode, faceDistance
  scripts/                 — clean-db (dev DB reset), generate-icon (regenerates mobile app icon PNGs)
  data/                    — Static JSON (love reason fallback bank, etc.)
prisma/
  schema.prisma            — DB schema. Couple is the central join; cascade-deletes wired so dissolving a space removes all shared data
  migrations/              — 11 migration folders, applied in lexical order
```

## Key architecture decisions

- **Stateless JWT + Redis-backed refresh tokens.** Access tokens are short-lived; refresh tokens are stored in `refresh:<userId>` with TTL, deleted on logout / Leave-Space.
- **End-to-end encrypted chat.** Backend stores ciphertext + AES-key wraps; never sees plaintext. Same wire format as the web client (SPKI/PKCS#8 keys, AES-GCM-256 with 12-byte IV).
- **Idempotent message inserts.** `Message`, `DiaryEntry`, `VaultFile` all have `(senderId/authorId/ownerId, clientId)` unique indexes — retried sends from the mobile retry queue collapse into the existing row.
- **Couple as the cascade root.** Deleting a `Couple` cascades to all shared data (messages, diary entries + reactions, moods, coupons, love reasons). User-scoped data (vault files, face descriptors) survives.
- **Lazy face-api loading.** TensorFlow + face-api models (~150 MB) only load on the first face-route request, not at boot. Keeps Render's 512 MB tier comfortable.
- **Brevo over SMTP.** Render free + Starter tiers block outbound SMTP. Brevo's HTTPS API ships OTPs reliably with no port issues.
- **Gemini-backed LoveBot fallback.** Auto-generates a fresh love reason when no user-authored reason is queued for the recipient, with a small inline fallback bank if Gemini is unavailable.

## Environment variables

Required:

```
DATABASE_URL              postgresql://...?sslmode=require
REDIS_URL                 rediss://default:...@...upstash.io:6379
JWT_SECRET                random 32+ bytes
JWT_REFRESH_SECRET        different random 32+ bytes (must NOT equal JWT_SECRET)
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY      PEM with literal \n escapes — Render's UI mangles real newlines
BREVO_API_KEY             xkeysib-...
BREVO_SENDER_EMAIL        verified sender address
BREVO_SENDER_NAME         "The Secret Space"
GEMINI_API_KEY            from aistudio.google.com (free tier)
ALLOWED_ORIGINS           comma-separated list of web origins
NODE_ENV                  production (on Render) / development (locally)
```

Optional:

```
PORT                      defaults to 3000
FACE_MATCH_THRESHOLD      defaults to 0.5
SMTP_*                    legacy nodemailer config — no longer used (Brevo replaces it)
```

## Deployment

See [`../DEPLOYMENT.md`](../DEPLOYMENT.md) at the project root for the full runbook (Render setup, Neon migration, Upstash provisioning, env var checklist, rollback procedures).

## License

See [`../LICENSE`](../LICENSE).
