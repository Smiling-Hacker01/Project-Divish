process.env.JWT_SECRET = 'this_is_a_very_long_test_secret_key_1234567890_jwt!';
process.env.JWT_REFRESH_SECRET = 'this_is_a_very_long_test_refresh_secret_key_1234567890_ref!';
process.env.JWT_TEMP_SECRET = 'this_is_a_very_long_test_temp_mfa_secret_key_1234567890_tmp!';
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5433/secret_space';
process.env.REDIS_URL = 'redis://localhost:6379';

import request from 'supertest';
import crypto from 'crypto';
// @ts-ignore
import forge from 'node-forge';

// In-memory Redis store
const redisStore = new Map<string, string>();
jest.mock('../config/redis', () => ({
  __esModule: true,
  default: {
    get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
    set: jest.fn(async (key: string, val: string) => {
      redisStore.set(key, val);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      redisStore.delete(key);
      return 1;
    }),
    incr: jest.fn(async (key: string) => {
      const cur = Number(redisStore.get(key) || 0) + 1;
      redisStore.set(key, String(cur));
      return cur;
    }),
    expire: jest.fn(async () => 1),
    scard: jest.fn(async () => 0),
    sadd: jest.fn(async () => 1),
    srem: jest.fn(async () => 1),
  },
}));

// Mock database state
const mockDb = {
  users: new Map<string, any>(),
  couples: new Map<string, any>(),
  devices: new Map<string, any>(),
  messages: new Map<string, any>(),
  vaultFiles: new Map<string, any>(),
};

jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(async ({ where }) => {
        if (where.id) return mockDb.users.get(where.id) || null;
        if (where.email) {
          for (const u of mockDb.users.values()) {
            if (u.email === where.email) return u;
          }
        }
        return null;
      }),
      delete: jest.fn(async ({ where }) => {
        const u = mockDb.users.get(where.id);
        mockDb.users.delete(where.id);
        return u;
      }),
    },
    couple: {
      findFirst: jest.fn(async ({ where }) => {
        for (const c of mockDb.couples.values()) {
          if (where.OR) {
            const matches = where.OR.some(
              (cond: any) =>
                (cond.userAId && c.userAId === cond.userAId) ||
                (cond.userBId && c.userBId === cond.userBId)
            );
            if (matches) return c;
          }
        }
        return null;
      }),
      findUnique: jest.fn(async ({ where }) => mockDb.couples.get(where.id) || null),
      update: jest.fn(async ({ where, data }) => {
        const c = mockDb.couples.get(where.id);
        if (c) {
          Object.assign(c, data);
          return c;
        }
        return null;
      }),
      delete: jest.fn(async ({ where }) => {
        const c = mockDb.couples.get(where.id);
        mockDb.couples.delete(where.id);
        return c;
      }),
    },
    device: {
      findFirst: jest.fn(async ({ where }) => {
        for (const d of mockDb.devices.values()) {
          if (where.id && d.id !== where.id) continue;
          if (where.userId && typeof where.userId === 'string' && d.userId !== where.userId) continue;
          if (where.userId?.in && !where.userId.in.includes(d.userId)) continue;
          if (where.status && d.status !== where.status) continue;
          if (where.revokedAt === null && d.revokedAt !== null) continue;
          return {
            ...d,
            keys: d.keys || [{ publicKey: d.publicKey || 'mock-key', keyVersion: 1, revokedAt: null }],
          };
        }
        return null;
      }),
      findMany: jest.fn(async ({ where }) => {
        return Array.from(mockDb.devices.values()).filter((d) => {
          if (where.userId?.in && !where.userId.in.includes(d.userId)) return false;
          if (where.userId && typeof where.userId === 'string' && d.userId !== where.userId) return false;
          if (where.status && d.status !== where.status) return false;
          if (where.revokedAt === null && d.revokedAt !== null) return false;
          return true;
        }).map((d) => ({
          ...d,
          keys: d.keys || [{ publicKey: d.publicKey || 'mock-key', keyVersion: 1, revokedAt: null }],
        }));
      }),
      findUnique: jest.fn(async ({ where }) => {
        const d = mockDb.devices.get(where.id);
        if (!d) return null;
        return {
          ...d,
          keys: d.keys || [{ publicKey: d.publicKey || 'mock-key', keyVersion: 1, revokedAt: null }],
        };
      }),
      count: jest.fn(async ({ where }) => {
        return Array.from(mockDb.devices.values()).filter(
          (d) =>
            d.userId === where.userId &&
            d.status === where.status &&
            d.revokedAt === null &&
            (!where.id?.not || d.id !== where.id.not)
        ).length;
      }),
      update: jest.fn(async ({ where, data }) => {
        const d = mockDb.devices.get(where.id);
        if (d) {
          Object.assign(d, data);
          return d;
        }
        return null;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const d of mockDb.devices.values()) {
          if (
            d.userId === where.userId &&
            d.status === where.status &&
            d.revokedAt === null &&
            (!where.id?.not || d.id !== where.id.not)
          ) {
            Object.assign(d, data);
            count++;
          }
        }
        return { count };
      }),
    },
    conversationKeyEpoch: {
      findMany: jest.fn(async ({ where }) => {
        return [{ id: 'mock-epoch-1', version: 1, status: 'active', coupleId: where?.coupleId, envelopes: [{ deviceId: 'dev-1' }] }];
      }),
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async ({ where }) => {
        if (where?.coupleId_version) {
          return { id: 'mock-epoch-1', version: where.coupleId_version.version, status: 'active', envelopes: [{ id: 'env-1' }] };
        }
        return null;
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async ({ data }) => ({ id: 'mock-epoch-1', version: 1, ...data })),
    },
    conversationDeviceEnvelope: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async ({ create }) => ({ id: 'mock-env-1', ...create })),
    },
    deviceKey: {
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    message: {
      findMany: jest.fn(async ({ where }) => {
        let msgs = Array.from(mockDb.messages.values()).filter((m) => m.coupleId === where.coupleId);
        if (where.NOT) {
          for (const notCond of where.NOT) {
            if (notCond.senderId?.not !== undefined && notCond.deletedForRecipient) {
              msgs = msgs.filter((m) => !(m.senderId !== notCond.senderId.not && m.deletedForRecipient));
            } else if (notCond.senderId && notCond.deletedForSender) {
              msgs = msgs.filter((m) => !(m.senderId === notCond.senderId && m.deletedForSender));
            }
          }
        }
        return msgs;
      }),
      create: jest.fn(async ({ data }) => {
        const id = data.id || crypto.randomUUID();
        const msg = { id, ...data };
        mockDb.messages.set(id, msg);
        return msg;
      }),
      delete: jest.fn(async ({ where }) => {
        const m = mockDb.messages.get(where.id);
        mockDb.messages.delete(where.id);
        return m;
      }),
    },
    vaultFile: {
      findMany: jest.fn(async ({ where }) => {
        return Array.from(mockDb.vaultFiles.values()).filter((f) =>
          where?.ownerId?.in?.includes(f.ownerId)
        );
      }),
      findUnique: jest.fn(async ({ where }) => mockDb.vaultFiles.get(where.id) || null),
    },
    faceDescriptor: {
      findUnique: jest.fn(async () => null),
    },
    $transaction: jest.fn(async (cb) => {
      const prismaMock = (await import('../config/prisma')).default;
      return cb(prismaMock);
    }),
  },
}));

import app from '../app';
import { signAccessToken, signTempToken, verifyAccessToken } from '../utils/jwt';
import { generateOtp } from '../utils/otp';

describe('Project Divish — Security & Reliability Test Suite', () => {
  let userA: any;
  let userB: any;
  let userC: any;
  let coupleAB: any;
  let devA: any;
  let devAKeys: { privKey: string; pubKey: string };

  beforeAll(() => {
    // Generate RSA keypair for User A's device
    const keypair = forge.pki.rsa.generateKeyPair({ bits: 1024 });
    const spkiDer = forge.asn1.toDer(forge.pki.publicKeyToAsn1(keypair.publicKey)).getBytes();
    const pkcs8Der = forge.asn1.toDer(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keypair.privateKey))).getBytes();
    const pubKeyB64 = Buffer.from(spkiDer, 'binary').toString('base64');
    const privKeyB64 = Buffer.from(pkcs8Der, 'binary').toString('base64');
    devAKeys = { privKey: privKeyB64, pubKey: pubKeyB64 };

    userA = {
      id: 'user-a-1111',
      name: 'Alice',
      email: 'alice@secretspace.test',
      passwordHash: '$2b$12$mockhashalice',
      publicKey: pubKeyB64,
    };
    userB = {
      id: 'user-b-2222',
      name: 'Bob',
      email: 'bob@secretspace.test',
      passwordHash: '$2b$12$mockhashbob',
      publicKey: 'mock-bob-public-key',
    };
    userC = {
      id: 'user-c-3333',
      name: 'Charlie (Attacker / Third Party)',
      email: 'charlie@attacker.test',
      passwordHash: '$2b$12$mockhashcharlie',
    };

    coupleAB = {
      id: 'couple-ab-1234',
      userAId: userA.id,
      userBId: userB.id,
      coupleCode: 'SECRET_123',
      status: 'active',
      userA,
      userB,
    };
    userA.coupleAsA = coupleAB;
    userB.coupleAsB = coupleAB;

    devA = {
      id: crypto.randomUUID(),
      userId: userA.id,
      name: 'Alice Phone',
      status: 'active',
      revokedAt: null,
      keys: [{ publicKey: pubKeyB64, keyVersion: 1, revokedAt: null }],
    };

    mockDb.users.set(userA.id, userA);
    mockDb.users.set(userB.id, userB);
    mockDb.users.set(userC.id, userC);
    mockDb.couples.set(coupleAB.id, coupleAB);
    mockDb.devices.set(devA.id, devA);

    mockDb.vaultFiles.set('alice-vault-secret-1', {
      id: 'alice-vault-secret-1',
      ownerId: userA.id,
      fileUrl: 'https://cloudinary.com/secret-space/vault/alice/photo1.jpg',
      fileType: 'image',
      thumbnailUrl: null,
      createdAt: new Date(),
    });
  });

  describe('Finding SEC-02: Complete MFA Bypass Prevention via JWT Type Separation', () => {
    it('should reject temp_mfa token when passed to authenticated routes', async () => {
      const tempToken = signTempToken({ userId: userA.id, email: userA.email });

      // 1. Rejected because signed with JWT_TEMP_SECRET (cannot verify against JWT_SECRET)
      expect(() => verifyAccessToken(tempToken)).toThrow();

      // 2. Explicit payload type check rejects even if forged with access token secret
      const forgedTempToken = require('jsonwebtoken').sign(
        { userId: userA.id, email: userA.email, type: 'temp_mfa' },
        process.env.JWT_SECRET!
      );
      expect(() => verifyAccessToken(forgedTempToken)).toThrow(
        /Temporary MFA token cannot be used as an access token/i
      );

      const res = await request(app)
        .get('/api/settings/profile')
        .set('Authorization', `Bearer ${tempToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid or expired token/i);
    });

    it('should accept valid full access token', async () => {
      const accessToken = signAccessToken({ userId: userA.id, email: userA.email });
      const res = await request(app)
        .get('/api/settings/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(userA.id);
    });
  });

  describe('Finding SEC-03: OTP Security & CSPRNG Verification', () => {
    it('should generate cryptographically strong 6-digit numeric OTP', () => {
      for (let i = 0; i < 50; i++) {
        const otp = generateOtp();
        expect(otp).toHaveLength(6);
        expect(Number(otp)).toBeGreaterThanOrEqual(100000);
        expect(Number(otp)).toBeLessThan(1000000);
      }
    });

    it('should lock out and invalidate OTP after 3 consecutive failures', async () => {
      const tempToken = signTempToken({ userId: userA.id, email: userA.email });
      redisStore.set(`otp:${userA.id}`, '654321');
      redisStore.delete(`otp_attempts:${userA.id}`);

      // Attempt 1
      const res1 = await request(app)
        .post('/api/auth/otp-verify')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({ otp: '000001' });
      expect(res1.status).toBe(401);
      expect(res1.body.error).toContain('2 attempt(s) remaining');

      // Attempt 2
      const res2 = await request(app)
        .post('/api/auth/otp-verify')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({ otp: '000002' });
      expect(res2.status).toBe(401);
      expect(res2.body.error).toContain('1 attempt(s) remaining');

      // Attempt 3
      const res3 = await request(app)
        .post('/api/auth/otp-verify')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({ otp: '000003' });
      expect(res3.status).toBe(401);
      expect(res3.body.error).toContain('Code has been invalidated');

      // Attempt 4: Lockout
      const res4 = await request(app)
        .post('/api/auth/otp-verify')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({ otp: '000004' });
      expect(res4.status).toBe(429);
      expect(res4.body.error).toMatch(/Too many failed OTP attempts/i);

      // Verify OTP key was removed
      expect(redisStore.get(`otp:${userA.id}`)).toBeUndefined();
    });
  });

  describe('Finding SEC-01 & Cross-Couple Vault Isolation Boundaries', () => {
    it('should REJECT empty request payload {} on /api/vault/unlock with 400 Bad Request', async () => {
      const token = signAccessToken({ userId: userA.id, email: userA.email });
      const res = await request(app)
        .post('/api/vault/unlock')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Password or valid biometric device signature is required/i);
    });

    it('should REJECT invalid/tampered biometric signature with 401', async () => {
      const token = signAccessToken({ userId: userA.id, email: userA.email });
      const res = await request(app)
        .post('/api/vault/unlock')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deviceId: devA.id,
          signature: Buffer.from('tampered-signature-data').toString('base64'),
          timestamp: Date.now(),
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid biometric device signature/i);
    });

    it('should ACCEPT authentic RSA biometric signature and issue vault session token', async () => {
      const token = signAccessToken({ userId: userA.id, email: userA.email });
      const timestamp = Date.now();
      const messageToSign = `vault-unlock:${userA.id}:${timestamp}`;

      // Sign using node-forge with Alice's device private key
      const der = Buffer.from(devAKeys.privKey, 'base64').toString('binary');
      const asn1 = forge.asn1.fromDer(der);
      const privateKey = forge.pki.privateKeyFromAsn1(asn1) as forge.pki.rsa.PrivateKey;
      const md = forge.md.sha256.create();
      md.update(messageToSign, 'utf8');
      const signatureBytes = privateKey.sign(md);
      const signatureB64 = Buffer.from(signatureBytes, 'binary').toString('base64');

      const res = await request(app)
        .post('/api/vault/unlock')
        .set('Authorization', `Bearer ${token}`)
        .send({
          deviceId: devA.id,
          signature: signatureB64,
          timestamp,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });

    it('should prevent third party user C from accessing Couple AB vault files', async () => {
      const tokenC = signAccessToken({ userId: userC.id, email: userC.email });

      // 1. Without valid vault session token -> 401 Unauthorized
      const resUnauth = await request(app)
        .get('/api/vault')
        .set('Authorization', `Bearer ${tokenC}`)
        .set('X-Vault-Token', 'some-vault-token');

      expect(resUnauth.status).toBe(401);
      expect(resUnauth.body.error).toMatch(/Invalid or expired vault token/i);

      // 2. Charlie unlocks his own vault, but queries strictly return Charlie's cohort (0 items)
      // Alice's secret file is NEVER returned to Charlie!
      redisStore.set(`vault:charlie-vault-token-123`, userC.id);
      const resCharlie = await request(app)
        .get('/api/vault')
        .set('Authorization', `Bearer ${tokenC}`)
        .set('X-Vault-Token', 'charlie-vault-token-123');

      expect(resCharlie.status).toBe(200);
      expect(resCharlie.body.items).toHaveLength(0);
      const leakedIds = resCharlie.body.items.map((i: any) => i.id);
      expect(leakedIds).not.toContain('alice-vault-secret-1');

      // 3. Legitimate partner Bob queries vault -> Alice's file is accessible within the couple
      redisStore.set(`vault:bob-vault-token-123`, userB.id);
      const tokenB = signAccessToken({ userId: userB.id, email: userB.email });
      const resBob = await request(app)
        .get('/api/vault')
        .set('Authorization', `Bearer ${tokenB}`)
        .set('X-Vault-Token', 'bob-vault-token-123');

      expect(resBob.status).toBe(200);
      const bobItemIds = resBob.body.items.map((i: any) => i.id);
      expect(bobItemIds).toContain('alice-vault-secret-1');
    });
  });

  describe('Finding REL-01: Device Bootstrap Reinstall Takeover', () => {
    it('should allow seamless takeover when reinstalling on a new device ID', async () => {
      const tokenA = signAccessToken({ userId: userA.id, email: userA.email });
      const newDevId = crypto.randomUUID();

      const newDevice = {
        id: newDevId,
        userId: userA.id,
        name: 'Alice Reinstalled Phone',
        status: 'pending',
        revokedAt: null,
      };
      mockDb.devices.set(newDevId, newDevice);

      // 1. Without takeover flag -> returns 409 with canTakeover: true
      const conflictRes = await request(app)
        .post('/api/chat/devices/bootstrap')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Device-Id', newDevId)
        .send({});

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.canTakeover).toBe(true);

      // 2. With takeover: true -> successfully activates and revokes old device
      const takeoverRes = await request(app)
        .post('/api/chat/devices/bootstrap')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Device-Id', newDevId)
        .send({ takeover: true });

      expect(takeoverRes.status).toBe(200);
      expect(takeoverRes.body.device.status).toBe('active');
      expect(devA.status).toBe('revoked');
    });
  });

  describe('Finding REL-04: Chat Deletion and History Isolation', () => {
    it('should exclude deleted-for-me messages from user history', async () => {
      const msg1 = {
        id: 'msg-deleted-by-sender',
        coupleId: coupleAB.id,
        senderId: userA.id,
        content: 'I deleted this for myself',
        deletedForSender: true,
        deletedForRecipient: false,
      };
      mockDb.messages.set(msg1.id, msg1);

      const tokenA = signAccessToken({ userId: userA.id, email: userA.email });
      const historyA = await request(app)
        .get('/api/chat/history')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(historyA.status).toBe(200);
      const idsA = historyA.body.messages.map((m: any) => m.id);
      expect(idsA).not.toContain(msg1.id);

      // Recipient Bob queries history -> message appears since Bob did not delete it
      const tokenB = signAccessToken({ userId: userB.id, email: userB.email });
      const historyB = await request(app)
        .get('/api/chat/history')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(historyB.status).toBe(200);
      const idsB = historyB.body.messages.map((m: any) => m.id);
      expect(idsB).toContain(msg1.id);
    });
  });

  describe('Finding SEC-05: IDOR Prevention on Public Key Retrieval', () => {
    it('should reject third party querying partner public key with 403', async () => {
      const tokenC = signAccessToken({ userId: userC.id, email: userC.email });
      const res = await request(app)
        .get(`/api/chat/keys/${userA.id}`)
        .set('Authorization', `Bearer ${tokenC}`);

      expect(res.status).toBe(403);
    });

    it('should allow legitimate partner Bob to retrieve Alice public key', async () => {
      const tokenB = signAccessToken({ userId: userB.id, email: userB.email });
      const res = await request(app)
        .get(`/api/chat/keys/${userA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.publicKey).toBe(userA.publicKey);
    });
  });

  describe('Finding ARCH-01: Partner Unlink & Account Deletion', () => {
    it('should allow partner (User B) to delete their account without crashing or bricking space', async () => {
      const tokenB = signAccessToken({ userId: userB.id, email: userB.email });
      const res = await request(app)
        .delete('/api/settings/account')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockDb.users.has(userB.id)).toBe(false);
      expect(coupleAB.userBId).toBeNull();
      expect(coupleAB.status).toBe('waiting');
    });
  });

  describe('Finding REL-05: Real-Time Epoch History Sync, Re-Wrapping, and Boundary Verification', () => {
    it('should accept non-UUID timestamp requestId and create epoch without 400 Bad Request', async () => {
      const devActive = {
        id: crypto.randomUUID(),
        userId: userA.id,
        status: 'active',
        name: 'Alice active phone',
        revokedAt: null,
        publicKey: 'mock-pub-key-a',
      };
      // Revoke any prior test devices so only devActive is active for this test
      for (const d of mockDb.devices.values()) {
        if (d.userId === userA.id || d.userId === userB.id) {
          d.status = 'revoked';
          d.revokedAt = new Date();
        }
      }
      mockDb.devices.set(devActive.id, devActive);

      // Re-link coupleAB for this test
      coupleAB.userBId = userB.id;
      coupleAB.status = 'active';
      userA.coupleAsA = coupleAB;
      mockDb.users.set(userA.id, userA);
      mockDb.users.set(userB.id, userB);
      mockDb.couples.set(coupleAB.id, coupleAB);

      const tokenA = signAccessToken({ userId: userA.id, email: userA.email });
      const res = await request(app)
        .post('/api/chat/epochs')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Device-Id', devActive.id)
        .send({
          requestId: `custom-timestamp-${Date.now()}-0.123456`,
          envelopes: [
            {
              deviceId: devActive.id,
              keyVersion: 1,
              wrappedEpochKey: 'test-wrapped-epoch-key-material',
            },
          ],
        });

      // Should succeed with 201 Created (not 400 Bad Request from strict UUID regex)
      expect(res.status).toBe(201);
      expect(res.body.epoch).toBeDefined();
    });

    it('should reject third party User C attempting to create an epoch for another couple', async () => {
      const devC = {
        id: crypto.randomUUID(),
        userId: userC.id,
        status: 'active',
        name: 'Attacker phone',
        revokedAt: null,
      };
      mockDb.devices.set(devC.id, devC);

      const tokenC = signAccessToken({ userId: userC.id, email: userC.email });
      const res = await request(app)
        .post('/api/chat/epochs')
        .set('Authorization', `Bearer ${tokenC}`)
        .set('X-Device-Id', devC.id)
        .send({
          requestId: crypto.randomUUID(),
          envelopes: [
            {
              deviceId: devC.id,
              keyVersion: 1,
              wrappedEpochKey: 'fake-key-material',
            },
          ],
        });

      // User C does not have an active couple, must be rejected with 409
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('active couple is required');
    });

    it('should reject epoch envelope submission without an active device identity', async () => {
      const tokenA = signAccessToken({ userId: userA.id, email: userA.email });
      const res = await request(app)
        .post('/api/chat/epochs/1/envelopes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          deviceId: crypto.randomUUID(),
          keyVersion: 1,
          wrappedEpochKey: 'fake-wrapped-key',
        });

      // Missing or invalid X-Device-Id header must be rejected with 400
      expect(res.status).toBe(400);
    });

    it('should allow active device to submit envelope for partner device and persist successfully', async () => {
      const devAlice = {
        id: crypto.randomUUID(),
        userId: userA.id,
        status: 'active',
        name: 'Alice Active',
        revokedAt: null,
      };
      const devBob = {
        id: crypto.randomUUID(),
        userId: userB.id,
        status: 'active',
        name: 'Bob New Device',
        revokedAt: null,
      };
      mockDb.devices.set(devAlice.id, devAlice);
      mockDb.devices.set(devBob.id, devBob);

      const tokenA = signAccessToken({ userId: userA.id, email: userA.email });
      const res = await request(app)
        .post('/api/chat/epochs/1/envelopes')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Device-Id', devAlice.id)
        .send({
          deviceId: devBob.id,
          keyVersion: 1,
          wrappedEpochKey: 'encrypted-epoch-key-for-bob',
        });

      expect(res.status).toBe(200);
      expect(res.body.envelope).toBeDefined();
    });
  });
});
