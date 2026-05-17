import * as faceapi from 'face-api.js';
import * as canvas from 'canvas';
// Side-effect import: registers the native TensorFlow backend that face-api.js uses
// for inference. Without it face-api falls back to a JS backend (or no backend at
// all) and detection silently fails.
import '@tensorflow/tfjs-node';
import path from 'path';
import { euclideanDistance, isFaceMatch } from '../utils/faceDistance';
import logger from '../config/logger';

// Patch face-api.js to use node-canvas
const { Canvas, Image, ImageData } = canvas;
// @ts-ignore
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

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

  const img = await canvas.loadImage(buffer);
  const cvs = canvas.createCanvas(img.width, img.height);
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