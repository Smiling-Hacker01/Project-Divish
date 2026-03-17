/**
 * Euclidean distance between two 128-float face descriptors.
 * Threshold ≤ 0.5 = same person (per face-api.js recommendation).
 */
export const euclideanDistance = (a: number[], b: number[]): number => {
  if (a.length !== b.length) throw new Error('Descriptor length mismatch');
  const sum = a.reduce((acc, val, i) => acc + Math.pow(val - b[i], 2), 0);
  return Math.sqrt(sum);
};

export const FACE_MATCH_THRESHOLD = parseFloat(process.env.FACE_MATCH_THRESHOLD || '0.5');

export const isFaceMatch = (a: number[], b: number[]): boolean =>
  euclideanDistance(a, b) <= FACE_MATCH_THRESHOLD;