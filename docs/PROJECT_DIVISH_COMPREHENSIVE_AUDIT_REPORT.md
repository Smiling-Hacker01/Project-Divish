# Project Divish (Secret Space) — Mobile & Backend Forensic Audit, Adversarial Testing & Reliability Engineering Report

**Audit Target Scope:** Strictly Mobile (`secret-space-mobile`) and Backend (`secret-space-backend`). (Web frontend excluded per instruction).  
**Evaluation Standards:** OWASP ASVS 4.0, OWASP API Security Top 10, CWE / SANS Top 25, WhatsApp / Instagram Production Messaging Reliability Benchmarks.  
**Audit Team Roles:** Principal Software Architect, Senior Security Engineer, QA Lead, Reliability Engineer, Adversarial Testing Coordinator.  
**Date of Audit:** November 1, 2026.

---

## 1. Executive Summary

### 1.1 System Health Overview
Project Divish ("The Secret Space") is a dual-user relationship operating platform designed to provide private, end-to-end encrypted messaging, milestone journaling, interactive coupons, biometric photo/video vaults, mood tracking, and scheduled AI romantic prompts (LoveBot).

The mobile application is built using React Native and Expo SDK 52, leveraging Android native biometric prompts (`expo-local-authentication`), SecureStore, and software RSA/AES cryptography (`node-forge`). The backend runs on Node.js 22 with Express, Prisma ORM against PostgreSQL, Redis (for pub/sub caching, rate limiting, and Socket.IO clustering), and Firebase Admin SDK (FCM push notifications).

While standalone feature workflows compile and pass type-checking (`tsc --noEmit` succeeds across both mobile and backend), an adversarial and architectural investigation revealed **four Critical (P0) and six High (P1) defects**. The system suffers from severe security bypasses, a fatal device reinstallation deadlock, broken real-time multi-process synchronization, and data integrity leaks.

### 1.2 Key Audit Highlights

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CRITICAL RISK SUMMARY                                  │
├───────────┬──────────────┬─────────────────────────────────────────────────────────────┤
│ ID        │ Severity     │ Vulnerability / Architectural Defect                        │
├───────────┼──────────────┼─────────────────────────────────────────────────────────────┤
│ SEC-01    │ Critical(P0) │ Biometric Vault Unlock Bypass via empty request payload     │
│ SEC-02    │ Critical(P0) │ Full MFA Authentication Bypass via JWT token type confusion │
│ REL-01    │ Critical(P0) │ Permanent Chat & Socket Deadlock on app reinstallation      │
│ SEC-03    │ High (P1)    │ Unbounded 6-digit MFA OTP brute-force & weak PRNG           │
│ SEC-04    │ High (P1)    │ Unauthenticated Face Biometric Overwrite (MFA Hijacking)    │
│ REL-02    │ High (P1)    │ Multi-Process presence and delivery receipt failure         │
│ REL-03    │ High (P1)    │ Dead code and unreachable decryption fallback on mobile     │
│ REL-04    │ High (P1)    │ Chat deletion failures: recipient blocked & history leaked  │
│ ARCH-01   │ High (P1)    │ Zombie account state: orphaned partner permanently bricked  │
│ DATA-01   │ High (P1)    │ Single User.fcmToken column breaks multi-device push        │
└───────────┴──────────────┴─────────────────────────────────────────────────────────────┘
```

---

## 2. Mobile & Backend Architecture & Interaction Map

```
                  ┌───────────────────────────────────────────┐
                  │           secret-space-mobile             │
                  │   (React Native Expo 52, Android SDK)     │
                  └─────┬───────────────────────────────┬─────┘
                        │ HTTPS (Axios / FileSystem)    │ WebSocket (Socket.IO 4.8)
                        ▼                               ▼
                  ┌───────────────────────────────────────────┐
                  │           secret-space-backend            │
                  │            (Node.js 22 / Express)         │
                  └─────┬───────────────────┬───────────┬─────┘
                        │                   │           │
                        ▼                   ▼           ▼
              ┌──────────────────┐ ┌────────────────┐ ┌─────────────────┐
              │    PostgreSQL    │ │     Redis      │ │ Cloudinary / FCM│
              │   (Prisma ORM)   │ │  (PubSub/Cache)│ │   (External)    │
              └──────────────────┘ └────────────────┘ └─────────────────┘
```

### 2.1 Backend Architecture
- **API Server:** Express application with `pinoHttp` structured logging, `helmet` security headers, and `cors`.
- **Database Layer:** Prisma ORM connected to PostgreSQL. Contains 11 models (`User`, `Couple`, `Message`, `Device`, `DeviceKey`, `ConversationKeyEpoch`, `ConversationDeviceEnvelope`, `DiaryEntry`, `DiaryReaction`, `Mood`, `Coupon`, `LoveReason`, `VaultFile`, `FaceDescriptor`).
- **Real-Time Layer:** `SocketIOServer` utilizing `@socket.io/redis-adapter` for multi-instance communication. Manages user presence, message broadcast, delivery/read receipts, typing indicators, and data mutation signals.
- **Background Jobs:** In-process `node-cron` running every minute for scheduled LoveBot prompt deliveries with Redis deduplication keys.
- **Storage & Push Services:** Cloudinary buffer/base64 uploads and Firebase Admin SDK push notifications.

### 2.2 Mobile Client Architecture
- **State Management & Navigation:** React Context (`AuthContext`, `ChatSocketContext`) driving React Navigation native stacks and bottom tabs.
- **Cryptographic Services:** 2048-bit RSA keypair generation via `node-forge`, stored in `expo-secure-store`. Conversation epoch management in `chatEpochs.ts` and background persistent message queue in `chatQueue.ts` (AsyncStorage).
- **Media Upload Pipeline:** `vaultUploadManager.ts` managing up to 3 concurrent multipart uploads directly via `FileSystem.createUploadTask`.

---

## 3. Comprehensive Findings Register

---

### Finding SEC-01: Biometric Vault Unlock Bypass via Empty Payload
- **Finding ID:** SEC-01
- **Severity:** Critical (P0)
- **Category:** Broken Authentication & Authorization
- **CWE:** CWE-306 (Missing Authentication for Critical Function), CWE-287
- **OWASP Category:** API1:2023 Broken Object Level Authorization, API2:2023 Broken Authentication
- **Affected Files:**
  - Backend: `secret-space-backend/src/controllers/vault.controller.ts:75-101`
  - Mobile: `secret-space-mobile/src/screens/vault/VaultUnlockScreen.tsx:82` & `src/api/vault.ts:38-45`
- **Root Cause & Technical Evidence:**
  In `VaultUnlockScreen.tsx`, when native biometric verification succeeds on the device, the client calls `vaultApi.unlock()` without parameters. In `vault.ts`, this issues:
  ```typescript
  // secret-space-mobile/src/api/vault.ts:
  unlock: async (password?: string) => {
    const { data } = await apiClient.post('/vault/unlock', password ? { password } : {});
    ...
  }
  ```
  On the backend, `vault.controller.ts` evaluates:
  ```typescript
  // secret-space-backend/src/controllers/vault.controller.ts:
  export const unlockVault = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user!.userId;
    const { password } = req.body;

    if (password) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) return res.status(401).json({ error: 'Incorrect password' });
    }

    const token = crypto.randomUUID();
    await redis.set(`vault:${token}`, userId, 'EX', VAULT_TOKEN_TTL);
    res.json({ success: true, token });
  };
  ```
  If `password` is omitted (or sent as `{}`), the password check is skipped entirely. The server generates a valid vault token and stores it in Redis without verifying biometrics or credentials.
- **Attack Scenario:**
  An attacker possessing an access token (or sniffing HTTP traffic) sends `POST /api/vault/unlock` with `{}`. The server responds with `{"success": true, "token": "<vaultToken>"}`. The attacker provides `x-vault-token` to `GET /api/vault` and downloads all private photos and videos.
- **Remediation:**
  1. The server must require server-attested biometric proof (e.g. Android KeyStore signed challenge using ECDSA/RSA keys created with `setUserAuthenticationRequired(true)`).
  2. If using password fallback, require `password` in request body and reject empty payloads with HTTP 400.

---

### Finding SEC-02: Complete MFA Bypass via JWT Token Type Confusion
- **Finding ID:** SEC-02
- **Severity:** Critical (P0)
- **Category:** Broken Authentication
- **CWE:** CWE-287 (Improper Authentication), CWE-305
- **OWASP Category:** API2:2023 Broken Authentication
- **Affected Files:**
  - Backend: `secret-space-backend/src/utils/jwt.ts:60-65`
  - Backend: `secret-space-backend/src/middlewares/auth.ts:14-28`
- **Root Cause & Technical Evidence:**
  When a user logs in with email and password (`POST /api/auth/login`), the server checks if the user has enrolled Face MFA. If so, it issues a temporary token:
  ```typescript
  // secret-space-backend/src/utils/jwt.ts:
  export const signTempToken = (payload: Omit<TempTokenPayload, 'type'>): string =>
    jwt.sign({ ...payload, type: 'temp_mfa' }, JWT_SECRET, { expiresIn: '10m' as any });

  export const verifyAccessToken = (token: string): JwtPayload =>
    jwt.verify(token, JWT_SECRET) as JwtPayload;
  ```
  Both `signTempToken` and `signAccessToken` sign payloads using the identical `JWT_SECRET`.
  When a client makes a request to any authenticated route, the middleware `verifyJWT` executes:
  ```typescript
  // secret-space-backend/src/middlewares/auth.ts:
  export const verifyJWT = (req: Request, res: Response, next: NextFunction): void => {
    ...
    req.user = verifyAccessToken(token);
    next();
  };
  ```
  `verifyAccessToken` does not inspect `type`. Since the `tempToken` is signed with `JWT_SECRET` and contains `{ userId, email }`, `req.user` is populated.
- **Attack Scenario:**
  An attacker enters a victim's breached password at `POST /api/auth/login`. The server returns `{ tempToken: "...", mfaMethod: "face" }`. The attacker passes `Authorization: Bearer <tempToken>` to `GET /api/chat/history` or `GET /api/vault`. The API accepts the token and returns the data, bypassing Face MFA and OTP completely.
- **Remediation:**
  1. Use a separate secret (`JWT_TEMP_SECRET`) for temporary MFA tokens.
  2. Update `verifyAccessToken` to assert `(decoded as any).type !== 'temp_mfa'`.

---

### Finding REL-01: Permanent Chat Deadlock on Mobile App Reinstallation
- **Finding ID:** REL-01
- **Severity:** Critical (P0)
- **Category:** Reliability & System Availability
- **Affected Files:**
  - Backend: `secret-space-backend/src/routes/chat.routes.ts:115-134, 217-241`
  - Backend: `secret-space-backend/src/websockets/chat.gateway.ts:80-90`
  - Mobile: `secret-space-mobile/src/services/cryptoIdentity.ts:133-141`
  - Mobile: `secret-space-mobile/src/services/deviceIdentity.ts:1-25`
- **Root Cause & Technical Evidence:**
  1. `secret-space-mobile` generates a random UUID `deviceId` upon installation and stores it in SecureStore (`deviceIdentity.ts`).
  2. On first installation, `ensurePublicKeyRegistered()` calls `POST /chat/devices/bootstrap`. The backend sees `activeCount === 0` and sets device status to `'active'`.
  3. When a user reinstalls the app (or clears app storage), SecureStore is wiped. A new `deviceId` UUID is generated.
  4. The client registers the new device (`POST /chat/devices`) and attempts to bootstrap (`POST /chat/devices/bootstrap`).
  5. The backend checks existing active devices for this user:
     ```typescript
     // chat.routes.ts line 121-127:
     const activeCount = await prisma.device.count({
       where: { userId: req.user!.userId, status: 'active', revokedAt: null },
     });
     if (activeCount > 0 && device.status !== 'active') {
       res.status(409).json({ error: 'Device requires approval by an active device' });
       return;
     }
     ```
     Because the old uninstalled device is still `'active'`, the backend returns **HTTP 409 Conflict**.
  6. The new device remains in `'pending'` status.
  7. Socket connection fails during handshake authentication:
     ```typescript
     // chat.gateway.ts line 80-87:
     const device = await prisma.device.findFirst({
       where: { id: deviceId, userId: decoded.userId, status: 'active', revokedAt: null },
     });
     if (!device) return next(new Error('Device is not authorized'));
     ```
  8. Approval requires an active device calling `POST /devices/pairing-approvals`. But the only active device was the uninstalled app!
  9. Revocation requires an active device calling `POST /devices/:deviceId/revoke` (`ownedDevice(req, true)`).
  10. The mobile app has no UI, screens, or logic for pairing challenges or device revocation.
- **Impact:** Any user who uninstalls/reinstalls the app or changes phones is permanently bricked from using chat and real-time features.
- **Remediation:**
  1. Provide an authenticated recovery mechanism (e.g. Email OTP verification) allowing the primary device to be bootstrapped when no active device is accessible.
  2. Implement device management and pairing screens on mobile.

---

### Finding SEC-03: Unbounded 6-Digit MFA OTP Brute-Force & Weak PRNG
- **Finding ID:** SEC-03
- **Severity:** High (P1)
- **Category:** Broken Authentication & Cryptographic Weakness
- **CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts), CWE-338 (Cryptographically Weak PRNG)
- **OWASP Category:** API2:2023 Broken Authentication, API4:2023 Unrestricted Resource Consumption
- **Affected Files:**
  - Backend: `secret-space-backend/src/routes/auth.routes.ts:47-48`
  - Backend: `secret-space-backend/src/controllers/auth.controller.ts:446-479`
  - Backend: `secret-space-backend/src/utils/otp.ts:15-16`
- **Root Cause & Technical Evidence:**
  1. `auth.routes.ts` attaches `otpLimiter` only to `/otp-request`. `/otp-verify` has **no rate limiter**:
     ```typescript
     router.post('/otp-request', otpLimiter, verifyTempJWT, otpRequest);
     router.post('/otp-verify', verifyTempJWT, otpVerify); // Unprotected!
     ```
  2. In `auth.controller.ts`, an incorrect OTP returns 401 but does not record failed attempts:
     ```typescript
     if (stored !== otp) {
       res.status(401).json({ error: 'Invalid OTP' }); // No attempt counter, no key invalidation!
       return;
     }
     ```
  3. The OTP is generated with `Math.random()`:
     ```typescript
     export const generateOtp = (): string =>
       String(Math.floor(100000 + Math.random() * 900000));
     ```
- **Attack Scenario:**
  An attacker with a valid `tempToken` (valid for 10 minutes) automates HTTP requests testing all 6-digit combinations against `/otp-verify`. Because there is no rate limiting, no backoff, and no attempt lockout, the correct OTP can be guessed within seconds.
- **Remediation:**
  1. Attach rate limiting (max 5 requests per 10 minutes) on `/otp-verify`.
  2. Track failed attempts in Redis and invalidate the OTP after 3 consecutive failures.
  3. Replace `Math.random()` with `crypto.randomInt(100000, 1000000)`.

---

### Finding SEC-04: Unauthenticated Face Biometric Overwrite (MFA Hijacking)
- **Finding ID:** SEC-04
- **Severity:** High (P1)
- **Category:** Broken Authentication
- **CWE:** CWE-287 (Improper Authentication), CWE-306
- **Affected Files:**
  - Backend: `secret-space-backend/src/controllers/auth.controller.ts:357-386`
  - Backend: `secret-space-backend/src/routes/auth.routes.ts:51`
- **Root Cause & Technical Evidence:**
  `POST /api/auth/enroll-face` is a public route accepting `{ email, password, faceImage }`. It performs:
  ```typescript
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const descriptor = await extractDescriptor(faceImage);
  await prisma.faceDescriptor.upsert({
    where: { userId: user.id },
    create: { userId: user.id, descriptor },
    update: { descriptor },
  });
  ```
  It requires no active session or secondary verification to overwrite an existing enrolled face.
- **Impact:** An attacker who acquires a victim's password can overwrite the victim's biometric facial descriptor with their own face embedding, immediately fulfilling Face MFA requirements.
- **Remediation:** For accounts with existing face descriptors, require authentication and email OTP verification before permitting biometric replacement.

---

### Finding REL-02: Socket Presence and Delivery Breakdown in Clustered Deployments
- **Finding ID:** REL-02
- **Severity:** High (P1)
- **Category:** Real-Time Reliability & Architectural Inconsistency
- **Affected Files:**
  - Backend: `secret-space-backend/src/websockets/chat.gateway.ts:17, 99, 123-127, 280-293`
- **Root Cause & Technical Evidence:**
  The server tracks active sockets using an in-memory process-local JavaScript `Map`:
  ```typescript
  const connectedUsers = new Map<string, string>();
  ...
  connectedUsers.set(userId, socket.id);
  ```
  When User A sends a message:
  ```typescript
  const isPartnerOnline = connectedUsers.has(partnerId);
  if (!isPartnerOnline) {
    await sendPush(partnerId, ...);
  } else {
    await prisma.message.update({ where: { id: message.id }, data: { status: 'delivered' } });
    io.to(coupleId).emit('message_status', { messageId: message.id, status: 'delivered' });
  }
  ```
  If User A is connected to Node Process 1 and User B is connected to Node Process 2:
  - `connectedUsers.has(partnerId)` returns `false` on Process 1.
  - The server fires an unnecessary FCM push notification to User B even though User B is actively connected.
  - The server **skips updating the message status to `delivered`**, leaving the sender with a single checkmark (`sent`) until User B sends a manual delivery receipt.
  - If a user opens the app on two devices, the second connection overwrites the first in `connectedUsers`. Closing one device removes the user from the map, incorrectly broadcasting `offline` to the partner.
- **Remediation:**
  Track presence globally in Redis (`redis.sadd('online:' + userId, socketId)`) or use Socket.IO adapter methods (`io.in('user:' + partnerId).fetchSockets()`).

---

### Finding REL-03: Dead Code & Unreachable Decryption Fallback in Mobile Client
- **Finding ID:** REL-03
- **Severity:** High (P1)
- **Category:** Code Quality & Fault Tolerance
- **Affected Files:**
  - Mobile: `secret-space-mobile/src/screens/chat/ChatScreen.tsx:411-470`
- **Root Cause & Technical Evidence:**
  In `ChatScreen.tsx`'s message decryption pump:
  ```typescript
  // ChatScreen.tsx lines 403-415:
  const coordinated = await decryptOnce(resolvedUser.id, msg, resolvedKeys.privateKey, resolvedKeypairCreatedAt);
  batch[msg.id] = coordinated;
  if (++sinceYield >= BATCH_SIZE) {
    commit(batch);
    batch = {};
    sinceYield = 0;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  continue; // <--- UNCONDITIONAL CONTINUE STATEMENT!

  try {
    const isMine = msg.senderId === resolvedUser.id;
    // 50+ lines of fallback RSA/AES decryption, legacy classification, and error logging!
  } catch (err) { ... }
  ```
  The `continue;` statement makes the entire subsequent `try/catch` fallback block dead, unreachable code. If `decryptOnce` encounters an unexpected failure, the legacy handling logic is never reached.
- **Remediation:** Remove the dead block and ensure all legacy decryption fallbacks and telemetry are encapsulated inside `decryptOnce`.

---

### Finding REL-04: Chat Deletion Flaws: Recipient Blocked & History Leaked
- **Finding ID:** REL-04
- **Severity:** High (P1)
- **Category:** Functional Defect & Data Inconsistency
- **Affected Files:**
  - Backend: `secret-space-backend/src/websockets/chat.gateway.ts:393`
  - Backend: `secret-space-backend/prisma/schema.prisma:220-221`
  - Backend: `secret-space-backend/src/routes/chat.routes.ts:570-576`
- **Root Cause & Technical Evidence:**
  1. In `chat.gateway.ts`:
     ```typescript
     else if (data.type === 'for_me' && msg.senderId === userId) {
       await prisma.message.update({
         where: { id: data.messageId },
         data: { deletedForSender: true, deletedAt: now },
       });
     }
     ```
     "Delete for me" is strictly restricted to `msg.senderId === userId`. The recipient cannot delete messages for themselves.
  2. `prisma/schema.prisma` contains `deletedForSender Boolean @default(false)` but has no `deletedForRecipient` column.
  3. In `chat.routes.ts:570-576`:
     ```typescript
     const messages = await prisma.message.findMany({
       where: { coupleId: couple.id },
       ...
     });
     ```
     `GET /api/chat/history` does not filter out messages where `deletedForSender: true` and `senderId === userId`.
- **Impact:**
  - Recipients cannot remove messages from their view.
  - Senders who delete a message "for me" see the deleted message reappear when reopening the chat or fetching history.
- **Remediation:**
  1. Add `deletedForRecipient Boolean @default(false)` to `messages` table.
  2. Update `chat.gateway.ts` to allow recipients to set `deletedForRecipient: true`.
  3. Update `GET /api/chat/history` to filter out messages where `(senderId === userId AND deletedForSender === true) OR (senderId !== userId AND deletedForRecipient === true)`.

---

### Finding REL-05: Message Edits Discard v2 Encryption Metadata
- **Finding ID:** REL-05
- **Severity:** Medium (P2)
- **Category:** Cryptographic Consistency & Data Integrity
- **Affected Files:**
  - Backend: `secret-space-backend/src/websockets/chat.gateway.ts:437-456`
- **Root Cause & Technical Evidence:**
  When a user edits a message encrypted with v2 epochs, `edit_message` receives `encryptionVersion`, `keyEpochVersion`, and `wrappedContentKey`. However, the database update only writes:
  ```typescript
  await prisma.message.update({
    where: { id: data.messageId },
    data: {
      content: data.content,
      senderAesKey: data.senderAesKey,
      recipientAesKey: data.recipientAesKey,
      editedAt,
    },
  });
  ```
  `encryptionVersion`, `keyEpochVersion`, and `wrappedContentKey` are omitted from the update.
- **Impact:** While live clients receive the edited metadata over Socket.IO, any client fetching chat history from PostgreSQL receives the edited ciphertext without its v2 epoch metadata, causing decryption failure.
- **Remediation:** Update `prisma.message.update` to persist `encryptionVersion`, `keyEpochVersion`, and `wrappedContentKey`.

---

### Finding ARCH-01: Zombie Account State on Space Dissolution
- **Finding ID:** ARCH-01
- **Severity:** High (P1)
- **Category:** Architecture & User Lifecycle
- **Affected Files:**
  - Backend: `secret-space-backend/src/controllers/settings.controller.ts:98-131, 191-194`
  - Mobile: `secret-space-mobile/src/screens/settings/SettingsScreen.tsx:270-279`
- **Root Cause & Technical Evidence:**
  When User A (space creator) invokes `POST /api/settings/leave-space`:
  ```typescript
  await prisma.$transaction(async (tx) => {
    await tx.couple.delete({ where: { id: coupleId } });
    await tx.user.delete({ where: { id: userId } });
  });
  ```
  The `Couple` and User A are deleted. User B's record in `users` is left intact without a couple.
  - In `SettingsScreen.tsx`, "Leave the space" is disabled for User B (`disabled={!user?.isCreator}`). User B has no way to leave or delete their account.
  - User B cannot call couple endpoints because `requireCouple` returns 403.
  - User B cannot sign up or join a new space because `POST /api/auth/signup` and `/api/auth/join` reject existing emails with HTTP 409.
- **Impact:** User B's account is permanently bricked and cannot create or join a new space.
- **Remediation:** Add an endpoint and UI allowing an orphaned partner to delete their profile or link to a new space.

---

### Finding DATA-01: Single FCM Token Column Breaks Multi-Device Notifications
- **Finding ID:** DATA-01
- **Severity:** High (P1)
- **Category:** Data Modeling & Notifications
- **Affected Files:**
  - Backend: `secret-space-backend/prisma/schema.prisma:15` (`User.fcmToken`)
  - Backend: `secret-space-backend/src/services/notification.service.ts:39-44`
  - Mobile: `secret-space-mobile/src/services/push.ts:83`
- **Root Cause & Technical Evidence:**
  The schema stores push tokens on `User.fcmToken` rather than on `Device`. When a user registers a second device, `PUT /api/settings/fcm-token` overwrites the first device's token. When `notification.service.ts` encounters an invalid token, it nullifies `User.fcmToken`, cutting off notifications for all devices owned by that user.
- **Remediation:** Relocate `fcmToken` to the `Device` model and dispatch notifications to all active registered devices of the user.

---

### Finding DATA-02: Mood Notes Silently Dropped on Retrieval
- **Finding ID:** DATA-02
- **Severity:** Medium (P2)
- **Category:** Data Loss & API Inconsistency
- **Affected Files:**
  - Backend: `secret-space-backend/src/controllers/mood.controller.ts:81-93`
  - Backend: `secret-space-backend/src/controllers/dashboard.controller.ts:95-101`
- **Root Cause & Technical Evidence:**
  `POST /api/mood` accepts a personal `note` string and saves it in `moods.note`. However, `GET /api/mood` and `GET /api/dashboard` both execute:
  ```typescript
  const moods = await prisma.mood.findMany({
    where: { coupleId },
    select: { userId: true, mood: true }, // note is omitted!
  });
  ```
- **Impact:** Personal mood notes typed by users are never returned to either partner.
- **Remediation:** Add `note: true` to the Prisma select blocks in `mood.controller.ts` and `dashboard.controller.ts`.

---

### Finding DATA-03: "Self-Healing" LoveBot Delivery Documented But Not Implemented
- **Finding ID:** DATA-03
- **Severity:** Medium (P2)
- **Category:** Reliability & Background Tasks
- **Affected Files:**
  - Backend: `secret-space-backend/src/controllers/dashboard.controller.ts:38-57, 102-114`
- **Root Cause & Technical Evidence:**
  Lines 38-57 document a self-healing delivery mechanism inside `getHomeData` to promote queued reasons if the server was asleep on Render during scheduled cron minutes. The function body, however, contains no code for promoting or generating reasons.
- **Impact:** When Render spins down on free/starter tiers, scheduled LoveBot prompts fail to trigger and the dashboard remains stuck on stale content until the user taps "refresh".
- **Remediation:** Implement the documented lazy-delivery check inside `getHomeData`.

---

### Finding SEC-05: IDOR on Partner Public Key Retrieval
- **Finding ID:** SEC-05
- **Severity:** Medium (P2)
- **Category:** Broken Object Level Authorization
- **CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)
- **Affected Files:**
  - Backend: `secret-space-backend/src/routes/chat.routes.ts:532-549` (`GET /api/chat/keys/:partnerId`)
- **Root Cause & Technical Evidence:**
  The route takes `:partnerId` from URL parameters and returns `user.publicKey` without verifying that `:partnerId` is linked to `req.user.userId`. Any authenticated user can harvest public keys across the platform.
- **Remediation:** Verify `req.params.partnerId === req.partnerId` using `requireCouple`.

---

### Finding SEC-06: Sensitive Data Exposure in Server Application Logs
- **Finding ID:** SEC-06
- **Severity:** Medium (P2)
- **Category:** Security & Information Disclosure
- **CWE:** CWE-532 (Insertion of Sensitive Information into Log File)
- **Affected Files:**
  - Backend: `secret-space-backend/src/controllers/auth.controller.ts:63, 69, 322, 331`
- **Root Cause & Technical Evidence:**
  The authentication controller logs plain emails, password lengths, and password hash prefixes (`hashPrefix: passwordHash.substring(0, 7)`) at `info` level.
- **Remediation:** Remove password lengths and hash prefixes from all logging calls.

---

### Finding TEST-01: Zero Automated Test Coverage in Backend
- **Finding ID:** TEST-01
- **Severity:** High (P1)
- **Category:** Testing & CI/CD
- **Affected Files:**
  - Backend: `secret-space-backend/package.json:19`
- **Root Cause & Technical Evidence:**
  Running `npm test` in `secret-space-backend` fails with exit code 1 (`No tests found`). The backend has 0 unit or integration tests. Total test count across the entire repository is 4 unit tests in `secret-space-mobile`.
- **Remediation:** Implement integration test suites covering auth, chat messaging, vault access, and coupon state machines.

---

## 4. WhatsApp & Instagram-Level Chat Reliability Assessment

| Chat Reliability Metric | WhatsApp / Instagram Benchmark | Project Divish Mobile + Backend | Gap Severity | Root Cause & Failure Scenario |
|---|---|---|---|---|
| **Message Durability** | Persistent local ACID database (SQLite / RocksDB) before dispatch. | In-memory React state + AsyncStorage queue. Plaintext preview is stripped on app restart. | Medium (P2) | Lack of structured SQLite store; optimistic bubbles rely on volatile memory. |
| **Delivery Guarantees** | Exactly-once delivery with end-to-end server ACK and delivery receipts. | Single ACK via socket callback. Status update fails in cluster mode (REL-02). | High (P1) | Process-local `connectedUsers` Map does not route status across multi-instance nodes. |
| **Message Ordering** | Strict monotonic sequence ordering per conversation. | Client timestamps + UUID ordering. Subject to clock drift and async socket arrival races. | Medium (P2) | No monotonic per-couple conversation sequence counter. |
| **Idempotency** | Duplicate retries collapse into existing row without side-effects. | Enforced via `@@unique([senderId, clientId])` on `messages` table. | **PASS** | `send_message` handler correctly handles replay without duplicating rows. |
| **Offline Queuing** | Transparent offline queue with exponential backoff on reconnection. | Implemented in `chatQueue.ts` (retries up to 5 times). | **PASS** | Replays queued entries upon socket reconnection. |
| **Multi-Device Sync** | Transparent device synchronization via Signal Protocol session ratchets. | Multi-device epoch backend exists but locks out users permanently on reinstall (REL-01). | **Critical (P0)**| No account recovery or device pairing UI exists on mobile. |
| **Message Deletion** | "Delete for Everyone" (time-bound) and "Delete for Me" for both parties. | "Delete for me" forbidden for recipient; deleted messages leak on history fetch (REL-04). | High (P1) | Missing `deletedForRecipient` column and incomplete query filters. |
| **Forward Secrecy** | Double Ratchet protocol (per-message key ratcheting). | Coarse epoch keys. Edited messages discard v2 encryption metadata in DB (REL-05). | Medium (P2) | Update queries omit v2 epoch columns. |

---

## 5. Feature Health Matrix (Mobile & Backend)

| Feature | Backend Controller / Route | Mobile Component / Screen | Status | Observed Defect & Failure Boundary |
|---|---|---|---|---|
| **User Registration** | `auth.controller.ts:54` | `SignUpScreen.tsx` | Functional | Logs password hash prefixes to console. |
| **Couple Linking** | `auth.controller.ts:112` | `JoinCodeScreen.tsx` | Functional | Race condition if couple code entered concurrently. |
| **Face MFA Enrollment** | `auth.controller.ts:357` | `FaceEnrollScreen.tsx` | **Insecure** | Unauthenticated overwrite vulnerability (SEC-04). |
| **Face MFA Verification**| `auth.controller.ts:393` | `FaceVerifyScreen.tsx` | **Insecure** | Bypassed if tempToken used on API routes (SEC-02). |
| **Email OTP Fallback** | `auth.controller.ts:446` | `OTPVerifyScreen.tsx` | **Insecure** | Unbounded brute-force vulnerability (SEC-03). |
| **Chat Messaging** | `chat.routes.ts` & gateway | `ChatScreen.tsx` | **Impaired** | Permanent deadlock on reinstall (REL-01), Cluster socket bug (REL-02). |
| **Chat Deletion** | `chat.gateway.ts:360` | `ChatScreen.tsx` | **Impaired** | Recipient cannot delete for me; history leaks deleted messages (REL-04). |
| **Chat Editing** | `chat.gateway.ts:406` | `ChatScreen.tsx` | **Impaired** | Edited v2 messages lose encryption metadata in DB (REL-05). |
| **Biometric Vault** | `vault.controller.ts` | `VaultUnlockScreen.tsx` | **Insecure** | Empty password payload grants full vault access (SEC-01). |
| **Vault File Upload** | `vault.controller.ts:107`| `vaultUploadManager.ts` | Functional | Robust concurrent upload pipeline with sliding token TTL. |
| **Shared Diary** | `diary.controller.ts` | `DiaryFeedScreen.tsx` | Functional | Soft-deleted entries returned with tombstone content. |
| **Coupons Engine** | `coupons.controller.ts` | `CouponsListScreen.tsx` | **Robust** | Conditional atomic updates prevent race conditions. |
| **Mood Check-in** | `mood.controller.ts` | `MoodModal.tsx` | **Impaired** | Notes are saved to DB but omitted from GET responses (DATA-02). |
| **LoveBot Scheduling** | `lovebot.cron.ts` | `HomeScreen.tsx` | **Impaired** | Missed during Render sleep; self-healing missing (DATA-03). |
| **Leave Space / Delete**| `settings.controller.ts:98`| `SettingsScreen.tsx` | **Impaired** | Orphaned partner account permanently bricked (ARCH-01). |

---

## 6. Prioritized Remediation Roadmap

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            REMEDIATION TIMELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ SPRINT 1 (Days 1–3): Critical Security Patches                              │
│   ├─ [SEC-01] Enforce mandatory password or hardware key attestation on    │
│   │           POST /api/vault/unlock. Reject empty payloads with HTTP 400.  │
│   ├─ [SEC-02] Introduce JWT_TEMP_SECRET for MFA tokens. Verify type in      │
│   │           verifyAccessToken to block temp tokens on protected endpoints.│
│   ├─ [SEC-03] Apply rate limiting and 3-attempt lockout on /otp-verify.     │
│   │           Replace Math.random() with crypto.randomInt().                │
│   └─ [SEC-04] Restrict /enroll-face to initial registration or require MFA. │
├─────────────────────────────────────────────────────────────────────────────┤
│ SPRINT 2 (Days 4–7): Chat Reliability & Device Recovery                     │
│   ├─ [REL-01] Build authenticated account recovery flow allowing primary     │
│   │           device bootstrap when no active device exists.                │
│   │           Add mobile UI for device management and pairing challenges.   │
│   ├─ [REL-02] Store active presence in Redis sets instead of local Maps.    │
│   ├─ [REL-04] Add deletedForRecipient to messages table. Filter deleted      │
│   │           messages from GET /api/chat/history.                          │
│   ├─ [REL-05] Include encryptionVersion and wrappedContentKey in edit_msg.  │
│   └─ [REL-03] Clean dead code block in mobile ChatScreen.tsx.               │
├─────────────────────────────────────────────────────────────────────────────┤
│ SPRINT 3 (Days 8–10): Data Integrity & User Lifecycle Cleanup               │
│   ├─ [ARCH-01] Add endpoints allowing orphaned partners to reset or leave. │
│   ├─ [DATA-01] Move fcmToken from User to Device model.                     │
│   ├─ [DATA-02] Return note in GET /api/mood and GET /api/dashboard.         │
│   ├─ [DATA-03] Implement documented lazy LoveBot delivery in getHomeData.   │
│   └─ [TEST-01] Add Jest Supertest test suite for core backend API routes.   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Verification Artifacts & Test Results

### 7.1 Backend Test Execution Log
```
$ npm test (in secret-space-backend)
> secret-space-backend@1.0.0 test
> jest

No tests found, exiting with code 1
In C:\Users\sbh2i\OneDrive\Desktop\Project-Divish\secret-space-backend
  189 files checked.
  testMatch: **/__tests__/**/*.[jt]s?(x), **/?(*.)+(spec|test).[tj]s?(x) - 0 matches
```

### 7.2 Mobile Crypto Test Execution Log
```
$ npm run test:crypto (in secret-space-mobile)
> secret-space-mobile@1.0.0 test:crypto
> jest --runInBand

PASS src/services/chatEpochs.test.ts (15.16 s)
PASS src/services/encryption.test.ts

Test Suites: 2 passed, 2 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        18.417 s
Ran all test suites.
```

### 7.3 TypeScript Strict Typecheck Execution Log
```
$ npx tsc --noEmit (in secret-space-backend)
Exit Code: 0 (Compilation Clean)

$ npm run typecheck (in secret-space-mobile)
> tsc --noEmit
Exit Code: 0 (Compilation Clean)
```
