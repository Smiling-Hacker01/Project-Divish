import jwt from 'jsonwebtoken';
import logger from '../config/logger';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '30d';

export interface JwtPayload {
  userId: string;
  email: string;
}

export interface TempTokenPayload {
  userId: string;
  email: string;
  type: 'temp_mfa';
}

/**
 * Call once at server startup to ensure JWT secrets are properly configured.
 */
export const validateJwtConfig = (): void => {
  const PLACEHOLDER_PATTERNS = [
    /^your[_ ]/i,
    /^change[_ ]me/i,
    /^replace/i,
    /^another[_ ]secret/i,
    /^placeholder/i,
    /secret_key/i,
  ];

  for (const [name, value] of [
    ['JWT_SECRET', JWT_SECRET],
    ['JWT_REFRESH_SECRET', JWT_REFRESH_SECRET],
  ] as const) {
    if (!value || value.length < 32) {
      logger.fatal(`${name} must be at least 32 characters long. Current length: ${value?.length ?? 0}`);
      process.exit(1);
    }
    if (PLACEHOLDER_PATTERNS.some((p) => p.test(value))) {
      logger.fatal(`${name} appears to be a placeholder value. Please set a real secret.`);
      process.exit(1);
    }
  }

  if (JWT_SECRET === JWT_REFRESH_SECRET) {
    logger.fatal('JWT_SECRET and JWT_REFRESH_SECRET must be different values.');
    process.exit(1);
  }
};

export const signAccessToken = (payload: JwtPayload): string =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY as any });

export const signRefreshToken = (payload: JwtPayload): string =>
  jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRY as any });

// Issued after password check passes — only valid for face-verify or otp-verify
export const signTempToken = (payload: Omit<TempTokenPayload, 'type'>): string =>
  jwt.sign({ ...payload, type: 'temp_mfa' }, JWT_SECRET, { expiresIn: '10m' as any });

export const verifyAccessToken = (token: string): JwtPayload =>
  jwt.verify(token, JWT_SECRET) as JwtPayload;

export const verifyRefreshToken = (token: string): JwtPayload =>
  jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;

export const verifyTempToken = (token: string): TempTokenPayload => {
  const decoded = jwt.verify(token, JWT_SECRET) as TempTokenPayload;
  if (decoded.type !== 'temp_mfa') throw new Error('Invalid token type');
  return decoded;
};