import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

type SyncCallback = () => void;

const listeners = new Set<SyncCallback>();

/**
 * Register a callback that fires when data should be refreshed.
 * Returns an unsubscribe function for cleanup in useEffect.
 */
export const onSync = (cb: SyncCallback): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/**
 * Manually trigger all registered sync callbacks.
 * Call this after any mutation (mood update, diary create, coupon mint, etc.)
 */
export const triggerSync = (): void => {
  listeners.forEach((cb) => {
    try { cb(); } catch { /* swallow errors from individual listeners */ }
  });
};

/**
 * Initialize app-state listener so returning from background triggers a sync.
 * Safe to call on web — gracefully no-ops if not native.
 */
export const initAppStateSync = (): void => {
  if (!Capacitor.isNativePlatform()) return;

  CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      // App came back to foreground — refetch all active screens
      triggerSync();
    }
  });
};
