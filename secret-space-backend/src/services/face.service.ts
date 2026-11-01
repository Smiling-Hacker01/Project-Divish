import * as faceapi from 'face-api.js';
import path from 'path';
import { euclideanDistance, isFaceMatch } from '../utils/faceDistance';
import logger from '../config/logger';

// Patch face-api.js to use node-canvas if available
let canvasModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  canvasModule = require('canvas');
  if (canvasModule) {
    const { Canvas, Image, ImageData } = canvasModule;
    // @ts-ignore
    faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
  }
} catch (err) {
  logger.warn('[FaceService] Native canvas bindings not available in this environment');
}

let modelsLoaded = false;
// In-flight promise dedup: if two face requests arrive before the first load completes,
// the second one awaits the same promise instead of triggering a parallel tensor alloc.
let modelsLoadPromise: Promise<void> | null = null;

const MODEL_PATH = path.join(process.cwd(), 'models'); // place face-api.js weights here

export const loadModels = async (): Promise<void> => {
  if (modelsLoaded) return;
  if (!modelsLoadPromise) {
    modelsLoadPromise = (async () => {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH);
        modelsLoaded = true;
        logger.info('[FaceService] Models loaded');
      } catch (err) {
        // Reset so the next caller retries from scratch instead of inheriting our
        // failure forever — otherwise a single bad load locks face routes until the
        // dyno restarts.
        modelsLoadPromise = null;
        throw err;
      }
    })();
  }
  return modelsLoadPromise;
};

/**
 * Extracts a 128-float descriptor from a base64 image string.
 * Returns null if no face detected.
 */
export const extractDescriptor = async (base64Image: string): Promise<number[] | null> => {
  await loadModels();

  // Strip data URI prefix if present
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  if (!canvasModule) {
    throw new Error('Canvas native module is unavailable in this environment');
  }

  const img = await canvasModule.loadImage(buffer);
  const cvs = canvasModule.createCanvas(img.width, img.height);
  const ctx = cvs.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const detection = await faceapi
    .detectSingleFace(cvs as unknown as HTMLCanvasElement)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return null;

  return Array.from(detection.descriptor);
};

/**
 * Compare a live image against a stored descriptor.
 * Returns { matched, distance }
 */
export const verifyFace = async (
  base64Image: string,
  storedDescriptor: number[]
): Promise<{ matched: boolean; distance: number | null }> => {
  const liveDescriptor = await extractDescriptor(base64Image);

  if (!liveDescriptor) {
    return { matched: false, distance: null };
  }

  const distance = euclideanDistance(liveDescriptor, storedDescriptor);
  const matched = isFaceMatch(liveDescriptor, storedDescriptor);

  return { matched, distance };
};