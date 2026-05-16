import AsyncStorage from '@react-native-async-storage/async-storage';
import { DiaryType } from '@/types/api';

/**
 * Single-slot draft for the diary composer. We don't support multiple parallel drafts
 * — the composer is a modal-style flow, not a windowed editor. Persisted to disk so a
 * crashed app or accidental back-swipe doesn't lose the user's writing.
 */

export type DiaryDraft = {
  type: DiaryType;
  content: string;
  // We deliberately do NOT persist mediaUri here — local file URIs are unstable across
  // app launches on iOS (asset libraries can re-key). The user re-attaches media on
  // restore; the text body is the part worth saving.
  milestone: boolean;
  updatedAt: number;
};

const KEY = 'secretspace.diary.draft.v1';

export const diaryDraft = {
  load: async (): Promise<DiaryDraft | null> => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DiaryDraft;
      // Sanity-check the shape so stale/old drafts don't blow up the composer.
      if (typeof parsed?.content !== 'string') return null;
      return parsed;
    } catch {
      return null;
    }
  },

  save: async (draft: DiaryDraft): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(draft));
    } catch {
      // Disk full or quota — drop silently; the in-memory state still survives this
      // session, just not a kill.
    }
  },

  clear: async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  },
};
