import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatAttachmentKind } from '@/api';

/**
 * Persistent outgoing-message queue. Survives app kills, replays on socket reconnect,
 * and dedupes server-side via the message's `clientId`. Production-grade contract:
 *
 *   - Append on every send (text or media).
 *   - Remove on successful `send_message` ack from server.
 *   - Mark `failed` when the ack reports an error or we give up after MAX_RETRIES.
 *   - On socket reconnect, replay every entry that is not `failed`.
 *   - User can tap a failed bubble to retry (resets retries → 0 and re-emits).
 *   - User can long-press a failed bubble to delete it permanently.
 */

export type ChatQueueEntry =
  | {
      kind: 'text';
      clientId: string;
      content: string;
      // Encrypted blobs to send over the socket. Encryption is done by the caller before
      // enqueue; we don't store any plaintext on disk (matches web's E2EE expectations).
      encryptedContent: string;
      senderAesKey: string | null;
      recipientAesKey: string | null;
      // Plaintext kept ONLY for the local UI to render the failed bubble. Never sent.
      // Session-only preview. It is intentionally omitted from persisted JSON.
      plainPreview?: string;
      retries: number;
      lastError: string | null;
      queuedAt: number;
    }
  | {
      kind: 'media';
      clientId: string;
      // Media URL — either already uploaded (Cloudinary URL) or null if upload is pending.
      // The retry flow uploads if null, then sends the socket message.
      mediaUrl: string | null;
      mediaUri: string | null; // local file:// uri (for re-upload on retry)
      mediaType: ChatAttachmentKind;
      mime: string;
      // Optional encrypted payload (only used for `kind: audio` to match web's encrypted
      // voice messages). Image/video/file are sent as plain Cloudinary URLs.
      encryptedContent: string | null;
      senderAesKey: string | null;
      recipientAesKey: string | null;
      retries: number;
      lastError: string | null;
      queuedAt: number;
    };

const STORAGE_KEY = 'secretspace.chat.queue.v1';
const MAX_RETRIES = 5;

let memoryCache: ChatQueueEntry[] | null = null;
let persistPromise: Promise<void> | null = null;

const load = async (): Promise<ChatQueueEntry[]> => {
  if (memoryCache) return memoryCache;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    memoryCache = [];
    return memoryCache;
  }
  try {
    const parsed = JSON.parse(raw) as ChatQueueEntry[];
    memoryCache = Array.isArray(parsed)
      ? parsed.map((entry) =>
          entry.kind === 'text' ? { ...entry, plainPreview: undefined } : entry
        )
      : [];
  } catch {
    memoryCache = [];
  }
  return memoryCache;
};

const persist = (): Promise<void> => {
  // Serialise persistence so concurrent calls don't trample each other's writes.
  const next = (async () => {
    await persistPromise; // wait for any prior write
    const persisted = (memoryCache ?? []).map((entry) => {
      if (entry.kind !== 'text') return entry;
      const { plainPreview: _plainPreview, ...withoutPreview } = entry;
      return withoutPreview;
    });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  })();
  persistPromise = next;
  return next;
};

export const chatQueue = {
  /** Snapshot of current queue (read-only). */
  list: async (): Promise<ChatQueueEntry[]> => {
    const all = await load();
    return [...all];
  },

  /** Get a specific entry by clientId, or null. */
  get: async (clientId: string): Promise<ChatQueueEntry | null> => {
    const all = await load();
    return all.find((e) => e.clientId === clientId) ?? null;
  },

  /** Append a new entry. Reject duplicates (same clientId already present). */
  enqueue: async (entry: ChatQueueEntry): Promise<void> => {
    const all = await load();
    if (all.some((e) => e.clientId === entry.clientId)) return;
    all.push(entry);
    await persist();
  },

  /** Remove an entry (call after server ack confirms persistence). */
  remove: async (clientId: string): Promise<void> => {
    const all = await load();
    const idx = all.findIndex((e) => e.clientId === clientId);
    if (idx >= 0) {
      all.splice(idx, 1);
      await persist();
    }
  },

  /** Increment retry counter, set last error, mark failed if at cap. Returns the
   *  updated entry, or null if it was removed. */
  recordFailure: async (
    clientId: string,
    error: string
  ): Promise<{ entry: ChatQueueEntry; permanent: boolean } | null> => {
    const all = await load();
    const entry = all.find((e) => e.clientId === clientId);
    if (!entry) return null;
    entry.retries = (entry.retries ?? 0) + 1;
    entry.lastError = error;
    const permanent = entry.retries >= MAX_RETRIES;
    await persist();
    return { entry, permanent };
  },

  /** Reset retry counter — used when the user manually taps "retry". */
  resetRetries: async (clientId: string): Promise<void> => {
    const all = await load();
    const entry = all.find((e) => e.clientId === clientId);
    if (entry) {
      entry.retries = 0;
      entry.lastError = null;
      await persist();
    }
  },

  /** Patch an existing entry (e.g. after an upload succeeds, store the resulting URL). */
  update: async (clientId: string, patch: Partial<ChatQueueEntry>): Promise<void> => {
    const all = await load();
    const idx = all.findIndex((e) => e.clientId === clientId);
    if (idx >= 0) {
      // Type-safe partial merge — we trust callers to pass a shape that matches `kind`.
      all[idx] = { ...all[idx], ...(patch as any) };
      await persist();
    }
  },

  /** Wipe everything (logout). */
  clear: async (): Promise<void> => {
    memoryCache = [];
    await persist();
  },

  MAX_RETRIES,
};
