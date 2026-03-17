import crypto from 'crypto';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0,O,1,I)

const randomSegment = (len: number): string => {
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join('');
};

// Format: LOVE-A3X-K9M  (6 crypto-random characters)
export const generateCoupleCode = (): string => {
  const part1 = randomSegment(3);
  const part2 = randomSegment(3);
  return `LOVE-${part1}-${part2}`;
};