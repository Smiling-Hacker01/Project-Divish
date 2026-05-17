import AsyncStorage from '@react-native-async-storage/async-storage';
import { DiaryType } from '@/types/api';

/**
 * Persistent diary-post queue. Mirrors the chat retry queue but holds one entry at a
 * time — diary posts are user-initiated, not stream-of-thought, so we don't expect
 * more than one in-flight at once. Multiple parallel entries are still supported.
 *
 * Lifecycle:
 *   - User taps "Post"          → enqueue entry, attempt upload + create
 *   - Upload + DB write succeed → remove from queue
 *   - Anything fails            → mark `failed` with lastError; user can retry from feed
 *   - Network restored / app foreground → auto-replay anything not in `failed` state
 */

export type DiaryQueueEntry = {
  localId: string;
  type: DiaryType;
  // Text body (always present for text entries; optional caption for media entries).
  content: string;
  // Local file:// URI for the picked media. Used to (re-)upload on retry.
  mediaUri: string | null;
  // MIME type captured at pick time so the multipart upload can declare it correctly.
  mediaMime: string | null;
  // After a successful upload, we cache the Cloudinary URL so a failed *DB-write only*
  // can be retried without re-uploading the file.
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  milestone: boolean;
  retries: number;
  lastError: string | null;
  queuedAt: number;
};

const STORAGE_KEY = 'secretspace.diary.queue.v1';
const MAX_RETRIES = 5;

let memoryCache: DiaryQueueEntry[] | null = null;
let persistPromise: Promise<void> | null = null;

const load = async (): Promise<DiaryQueueEntry[]> => {
  if (memoryCache) return memoryCache;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    memoryCache = [];
    return memoryCache;
  }
  try {
    const parsed = JSON.parse(raw) as DiaryQueueEntry[];
    memoryCache = Array.isArray(parsed) ? parsed : [];
  } catch {
    memoryCache = [];
  }
  return memoryCache;
};

const persist = (): Promise<void> => {
  const next = (async () => {
    await persistPromise;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memoryCache ?? []));
  })();
  persistPromise = next;
  return next;
};

export const diaryQueue = {
  list: async (): Promise<DiaryQueueEntry[]> => {
    const all = await load();
    return [...all];
  },

  get: async (localId: string): Promise<DiaryQueueEntry | null> => {
    const all = await load();
    return all.find((e) => e.localId === localId) ?? null;
  },

  enqueue: async (entry: DiaryQueueEntry): Promise<void> => {
    const all = await load();
    if (all.some((e) => e.localId === entry.localId)) return;
    all.push(entry);
    await persist();
  },

  remove: async (localId: string): Promise<void> => {
    const all = await load();
    const idx = all.findIndex((e) => e.localId === localId);
    if (idx >= 0) {
      all.splice(idx, 1);
      await persist();
    }
  },

  update: async (localId: string, patch: Partial<DiaryQueueEntry>): Promise<void> => {
    const all = await load();
    const idx = all.findIndex((e) => e.localId === localId);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      await persist();
    }
  },

  recordFailure: async (
    localId: string,
    error: string
  ): Promise<{ entry: DiaryQueueEntry; permanent: boolean } | null> => {
    const all = await load();
    const entry = all.find((e) => e.localId === localId);
    if (!entry) return null;
    entry.retries += 1;
    entry.lastError = error;
    const permanent = entry.retries >= MAX_RETRIES;
    await persist();
    return { entry, permanent };
  },

  resetRetries: async (localId: string): Promise<void> => {
    const all = await load();
    const entry = all.find((e) => e.localId === localId);
    if (entry) {
      entry.retries = 0;
      entry.lastError = null;
      await persist();
    }
  },

  clear: async (): Promise<void> => {
    memoryCache = [];
    await persist();
  },

  MAX_RETRIES,
};
