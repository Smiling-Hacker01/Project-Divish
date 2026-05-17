import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persistent vault-upload queue. Unlike chat/diary (one in-flight per send), vault
 * batches: a user can pick 50 photos and the queue holds all 50 across app restarts.
 * The upload manager (see [vaultUploadManager.ts]) is the worker that drains it.
 */

export type VaultQueueEntry = {
  localId: string;
  mediaUri: string; // file:// URI of the picked asset
  mediaMime: string;
  fileType: 'image' | 'video';
  // After a successful upload, the resulting Cloudinary URL is stored here so a
  // *DB-write only* retry doesn't re-upload the file.
  uploadedUrl: string | null;
  uploadedThumbnailUrl: string | null;
  retries: number;
  lastError: string | null;
  queuedAt: number;
};

const STORAGE_KEY = 'secretspace.vault.queue.v1';
const MAX_RETRIES = 5;

let memoryCache: VaultQueueEntry[] | null = null;
let persistPromise: Promise<void> | null = null;

const load = async (): Promise<VaultQueueEntry[]> => {
  if (memoryCache) return memoryCache;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    memoryCache = [];
    return memoryCache;
  }
  try {
    const parsed = JSON.parse(raw) as VaultQueueEntry[];
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

export const vaultQueue = {
  list: async (): Promise<VaultQueueEntry[]> => {
    const all = await load();
    return [...all];
  },

  get: async (localId: string): Promise<VaultQueueEntry | null> => {
    const all = await load();
    return all.find((e) => e.localId === localId) ?? null;
  },

  enqueue: async (entry: VaultQueueEntry): Promise<void> => {
    const all = await load();
    if (all.some((e) => e.localId === entry.localId)) return;
    all.push(entry);
    await persist();
  },

  enqueueMany: async (entries: VaultQueueEntry[]): Promise<void> => {
    if (entries.length === 0) return;
    const all = await load();
    const existing = new Set(all.map((e) => e.localId));
    for (const e of entries) if (!existing.has(e.localId)) all.push(e);
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

  update: async (localId: string, patch: Partial<VaultQueueEntry>): Promise<void> => {
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
  ): Promise<{ entry: VaultQueueEntry; permanent: boolean } | null> => {
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
