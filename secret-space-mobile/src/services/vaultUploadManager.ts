import * as FileSystem from 'expo-file-system';
import { vaultApi, tokens } from '@/api';
import { vaultQueue, VaultQueueEntry } from './vaultQueue';
import { VaultItem } from '@/types/api';

/**
 * Vault upload manager — a singleton worker that drains the vaultQueue with up to
 * MAX_CONCURRENT parallel uploads. It exposes a snapshot of current state via a
 * subscribe()/getState() pattern so any screen can render the aggregate progress
 * without coordinating directly with the worker.
 *
 * Concurrency model:
 *   - At most MAX_CONCURRENT createUploadTask instances run at once.
 *   - Each in-flight upload has its own cancel handle; cancelAll() aborts mid-batch.
 *   - On a failure, the entry's retries++ and it goes back to the pool. When retries
 *     hit MAX_RETRIES it stays in queue with `lastError` set and is excluded from
 *     auto-drain until the user explicitly retries (resetRetries).
 *   - drain() is idempotent — calling it while already running is a no-op.
 */

const MAX_CONCURRENT = 3;

type Listener = (state: ManagerState) => void;

export type PerEntryState = {
  localId: string;
  status: 'queued' | 'uploading' | 'creating' | 'done' | 'failed';
  progress: number; // 0..1, only meaningful during 'uploading'
  error?: string;
  // True when the user explicitly enqueued this in the current session (picker flow).
  // False for entries auto-resumed from disk on app start — those upload silently and
  // never trigger the foreground "Uploading…" banner.
  userInitiated?: boolean;
};

export interface ManagerState {
  running: boolean;
  total: number;
  completed: number;
  failed: number;
  // When set, the worker has detected the vault token expired mid-batch. The queue
  // is paused (not consumed further) until the user re-unlocks; once they do,
  // resumeAfterUnlock() drains the queue again with no entries having been counted
  // as failed.
  needsUnlock: boolean;
  entries: Record<string, PerEntryState>;
}

const listeners = new Set<Listener>();
let state: ManagerState = {
  running: false,
  total: 0,
  completed: 0,
  failed: 0,
  needsUnlock: false,
  entries: {},
};

// Active createUploadTask handles keyed by localId — needed so cancelAll can abort
// in-flight HTTP traffic immediately rather than waiting for the server to time out.
const activeTasks = new Map<string, FileSystem.UploadTask>();
let onDoneCallback: ((item: VaultItem) => void) | null = null;

// Tracks which localIds were enqueued through `markSessionInitiated()` (i.e. the user
// just picked them from the picker in this session). Entries NOT in this set are
// being silently resumed from disk after a previous session's interrupted upload —
// the grid should NOT show an "Uploading" banner for those, because from the user's
// perspective they didn't initiate anything. The set is module-scoped (not persisted)
// so it resets every cold start, which is the correct behaviour.
const sessionInitiated = new Set<string>();

const emit = () => {
  // Shallow copy so React diff'ing kicks in for subscribers.
  state = { ...state, entries: { ...state.entries } };
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      // listener-side errors shouldn't poison the worker
    }
  }
};

const setEntryState = (localId: string, patch: Partial<PerEntryState>) => {
  const prev = state.entries[localId] ?? { localId, status: 'queued', progress: 0 };
  state.entries[localId] = { ...prev, ...patch };
  emit();
};

const recomputeAggregate = (queue: VaultQueueEntry[]) => {
  state.total = queue.length;
  state.completed = 0;
  state.failed = queue.filter((e) => e.retries >= vaultQueue.MAX_RETRIES).length;
};

// Upload one entry: file → /vault/upload (multipart) → /vault POST with the URL.
// Updates the queue on each step so a kill mid-stream resumes cleanly.
const processOne = async (entry: VaultQueueEntry): Promise<void> => {
  const userInitiated = sessionInitiated.has(entry.localId);
  setEntryState(entry.localId, {
    status: 'uploading',
    progress: 0,
    error: undefined,
    userInitiated,
  });
  try {
    // Step 1 — multipart upload (skipped if we already have a URL from a prior run).
    let url = entry.uploadedUrl;
    let thumb = entry.uploadedThumbnailUrl;
    if (!url) {
      const accessToken = await tokens.getAccess();
      if (!accessToken) throw new Error('Session expired. Please sign in again.');
      const vaultToken = await vaultApi.getToken();
      if (!vaultToken) throw new Error('Vault locked. Unlock again to resume uploads.');

      const task = FileSystem.createUploadTask(
        vaultApi.uploadUrl(),
        entry.mediaUri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: 'file',
          mimeType: entry.mediaMime,
          parameters: { type: entry.fileType },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Vault-Token': vaultToken,
          },
        },
        (p) => {
          if (p.totalBytesExpectedToSend > 0) {
            setEntryState(entry.localId, {
              progress: p.totalBytesSent / p.totalBytesExpectedToSend,
            });
          }
        }
      );
      activeTasks.set(entry.localId, task);
      const result = await task.uploadAsync();
      activeTasks.delete(entry.localId);

      if (!result) throw new Error('Upload was cancelled.');
      if (result.status === 401) {
        // Either the JWT or the vault token expired mid-batch. Don't keep failing
        // every queued entry — pause the worker, clear the local vault token, and
        // surface needsUnlock so the UI can prompt for biometric re-auth. The queue
        // is intact; resumeAfterUnlock() restarts it.
        await vaultApi.clearToken().catch(() => undefined);
        state.needsUnlock = true;
        // Roll back this entry's status so it isn't double-counted as failed when
        // we resume later.
        setEntryState(entry.localId, { status: 'queued', progress: 0, error: undefined });
        emit();
        throw new Error('__VAULT_NEEDS_UNLOCK__');
      }
      if (result.status < 200 || result.status >= 300) {
        const detail = (() => {
          try {
            return JSON.parse(result.body ?? '{}').error ?? `HTTP ${result.status}`;
          } catch {
            return `HTTP ${result.status}`;
          }
        })();
        throw new Error(detail);
      }
      const parsed = JSON.parse(result.body) as { url: string; thumbnailUrl?: string };
      if (!parsed?.url) throw new Error('Upload finished but no URL was returned.');
      url = parsed.url;
      thumb = parsed.thumbnailUrl ?? null;
      // Persist BEFORE the create-item step so a crash here doesn't re-upload.
      await vaultQueue.update(entry.localId, {
        uploadedUrl: url,
        uploadedThumbnailUrl: thumb,
      });
    }

    // Step 2 — DB create. Idempotent on (ownerId, clientId) so retried creates
    // collapse to the same row.
    setEntryState(entry.localId, { status: 'creating', progress: 1 });
    const item = await vaultApi.create({
      fileType: entry.fileType,
      fileUrl: url!,
      thumbnailUrl: thumb ?? undefined,
      clientId: entry.localId,
    });

    await vaultQueue.remove(entry.localId);
    setEntryState(entry.localId, { status: 'done', progress: 1 });
    state.completed += 1;
    emit();
    onDoneCallback?.(item);
  } catch (err: any) {
    activeTasks.delete(entry.localId);
    const msg = err?.response?.data?.error ?? err?.message ?? 'Upload failed';
    // Special sentinel from the 401 path — entry stays queued, not counted as failed.
    if (msg === '__VAULT_NEEDS_UNLOCK__') return;
    // Also catch axios-level 401 from /vault POST (DB-create step).
    if (err?.response?.status === 401) {
      await vaultApi.clearToken().catch(() => undefined);
      state.needsUnlock = true;
      setEntryState(entry.localId, { status: 'queued', progress: 0, error: undefined });
      emit();
      return;
    }
    const failure = await vaultQueue.recordFailure(entry.localId, msg).catch(() => null);
    setEntryState(entry.localId, { status: 'failed', error: msg });
    if (failure?.permanent) {
      state.failed += 1;
      emit();
    }
  }
};

// Round-robin pump: pulls up to MAX_CONCURRENT entries, awaits the first one to
// settle, then refills. Stops when every queued entry has either succeeded, hit
// MAX_RETRIES, or the worker has been paused for vault re-unlock.
const drainLoop = async () => {
  if (state.running) return;
  state.running = true;
  emit();
  try {
    while (true) {
      // Pause check — if a 401 set needsUnlock, suspend the worker until the user
      // re-unlocks and calls resumeAfterUnlock(). Active tasks already cancelled
      // their own state above; queued entries are simply not drained.
      if (state.needsUnlock) break;

      const all = await vaultQueue.list();
      recomputeAggregate(all);
      // Eligible = queued + not yet at retry cap + not currently in flight.
      const eligible = all.filter(
        (e) => e.retries < vaultQueue.MAX_RETRIES && !activeTasks.has(e.localId) && state.entries[e.localId]?.status !== 'failed'
      );
      if (eligible.length === 0) break;

      const batch = eligible.slice(0, MAX_CONCURRENT - activeTasks.size);
      if (batch.length === 0) {
        // Fully saturated — wait briefly for an in-flight slot to free up.
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      // Fire-and-forget per-entry; the loop iteration awaits any one of them via
      // Promise.race so we top-up the pool as soon as a slot opens.
      const promises = batch.map((entry) => processOne(entry));
      await Promise.race(promises);
    }
    // Wait for any straggler in flight before declaring the run done.
    while (activeTasks.size > 0) {
      await new Promise((r) => setTimeout(r, 100));
    }
  } finally {
    state.running = false;
    emit();
  }
};

export const vaultUploadManager = {
  /** Mark the given localIds as belonging to the *current* user-initiated session
   *  (e.g. just picked from the photo picker). Only these entries surface the
   *  foreground "Uploading…" banner; auto-resumed entries from disk upload silently
   *  to avoid the phantom-banner bug. */
  markSessionInitiated: (ids: string[]): void => {
    for (const id of ids) sessionInitiated.add(id);
  },

  /** Start draining the queue. Idempotent. */
  drain: (): void => {
    void drainLoop();
  },

  /** Cancel all in-flight uploads. Queued-but-not-yet-started entries stay so the
   *  user can resume later. */
  cancelAll: (): void => {
    for (const task of activeTasks.values()) {
      try {
        task.cancelAsync();
      } catch {
        // ignore
      }
    }
    activeTasks.clear();
  },

  /** Resume the worker after a successful vault re-unlock. Clears the paused flag
   *  and re-drives the drain loop. */
  resumeAfterUnlock: (): void => {
    state.needsUnlock = false;
    emit();
    vaultUploadManager.drain();
  },

  /** Manual retry of a single failed entry. Resets its retry counter so the auto
   *  drain loop will pick it up again. */
  retry: async (localId: string): Promise<void> => {
    await vaultQueue.resetRetries(localId);
    setEntryState(localId, { status: 'queued', error: undefined, progress: 0 });
    state.failed = Math.max(0, state.failed - 1);
    emit();
    vaultUploadManager.drain();
  },

  /** Discard a permanently-failed entry. */
  discard: async (localId: string): Promise<void> => {
    await vaultQueue.remove(localId);
    delete state.entries[localId];
    sessionInitiated.delete(localId);
    state.failed = Math.max(0, state.failed - 1);
    emit();
  },

  /** Drop every entry that hit MAX_RETRIES — used by the "dismiss failed" UI so the
   *  banner can be cleared without retrying. We also wipe their entries from the
   *  in-memory state map so the manager's view reconciles with disk on the next
   *  drain. Successful and in-flight entries are left untouched. */
  discardAllFailed: async (): Promise<void> => {
    const queue = await vaultQueue.list();
    const failed = queue.filter((e) => e.retries >= vaultQueue.MAX_RETRIES);
    for (const entry of failed) {
      await vaultQueue.remove(entry.localId).catch(() => undefined);
      delete state.entries[entry.localId];
      sessionInitiated.delete(entry.localId);
    }
    state.failed = 0;
    emit();
  },

  /** Register a callback fired each time an entry uploads successfully. The grid
   *  uses this to optimistically insert the freshly-created item. */
  onItemCreated: (cb: ((item: VaultItem) => void) | null): void => {
    onDoneCallback = cb;
  },

  subscribe: (fn: Listener): (() => void) => {
    listeners.add(fn);
    // Emit current state to the new subscriber so they're never blank.
    fn(state);
    return () => {
      listeners.delete(fn);
    };
  },

  getState: (): ManagerState => state,
};
