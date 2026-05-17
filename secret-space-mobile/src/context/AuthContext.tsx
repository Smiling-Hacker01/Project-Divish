import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, prewarmBackend, settingsApi, setLogoutHandler, tokens } from '@/api';
import { User } from '@/types/api';
import {
  initPushNotifications,
  unregisterPushNotifications,
  teardownPushNotifications,
} from '@/services/push';
import { clearKeyPair, getOrCreateKeyPair } from '@/services/cryptoIdentity';
import { chatQueue } from '@/services/chatQueue';

const USER_KEY = 'secretspace.user';
const NOTIF_PREF_KEY = 'secretspace.notificationsEnabled';

interface AuthCtx {
  user: User | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  notificationsEnabled: boolean;
  setUser: (u: User | null) => Promise<void>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  setNotificationsEnabled: (v: boolean) => Promise<void>;
}

const Context = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const pushInitForUserRef = useRef<string | null>(null);

  const setUser = useCallback(async (u: User | null) => {
    setUserState(u);
    if (u) await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
    else await AsyncStorage.removeItem(USER_KEY);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const { user: fresh } = await settingsApi.getProfile();
      await setUser(fresh);
    } catch {
      // swallow; auth interceptor will force logout if token invalid
    }
  }, [setUser]);

  const logout = useCallback(async () => {
    // Best-effort: clear server-side token before tearing down so the next person to sign
    // in on this device doesn't inherit the previous account's push routes.
    try {
      await unregisterPushNotifications();
    } catch {
      // ignore
    }
    teardownPushNotifications();
    // Drop the previous user's keypair AND their pending message queue so the next
    // account on this device gets a fresh identity and isn't haunted by orphan sends.
    await clearKeyPair().catch(() => undefined);
    await chatQueue.clear().catch(() => undefined);
    pushInitForUserRef.current = null;
    await authApi.logout();
    await setUser(null);
  }, [setUser]);

  const setNotificationsEnabled = useCallback(async (v: boolean) => {
    setNotificationsEnabledState(v);
    await AsyncStorage.setItem(NOTIF_PREF_KEY, v ? '1' : '0');
    if (v) {
      // Re-init will request permission if needed and push a fresh token.
      await initPushNotifications();
      pushInitForUserRef.current = user?.id ?? null;
    } else {
      await unregisterPushNotifications();
    }
  }, [user?.id]);

  // Bootstrap: restore session + notif preference.
  useEffect(() => {
    setLogoutHandler(() => {
      setUserState(null);
      AsyncStorage.removeItem(USER_KEY);
      teardownPushNotifications();
      pushInitForUserRef.current = null;
    });
  }, []);

  useEffect(() => {
    // Kick the backend awake in parallel with session restore. If the dyno is cold,
    // it gets the ~30s spin-up window while the splash is showing instead of while
    // the user is waiting on /me or the chat socket.
    prewarmBackend();
    (async () => {
      try {
        const [storedUser, accessToken, notifPref] = await Promise.all([
          AsyncStorage.getItem(USER_KEY),
          tokens.getAccess(),
          AsyncStorage.getItem(NOTIF_PREF_KEY),
        ]);
        if (notifPref === '0') setNotificationsEnabledState(false);
        if (storedUser && accessToken) {
          setUserState(JSON.parse(storedUser));
          refreshProfile();
        }
      } finally {
        setIsBootstrapping(false);
      }
    })();
  }, [refreshProfile]);

  // Whenever the authenticated user id changes, (re)initialize push so the FCM token is
  // bound to the current account. We avoid re-running if the user object identity flickers
  // but the id is the same (e.g. profile refresh).
  useEffect(() => {
    if (!user?.id) return;
    if (!notificationsEnabled) return;
    if (pushInitForUserRef.current === user.id) return;
    pushInitForUserRef.current = user.id;
    initPushNotifications().catch((err) => {
      console.warn('[Auth] push init failed', err);
    });
  }, [user?.id, notificationsEnabled]);

  // Eagerly start RSA keygen the moment the user authenticates. Pure-JS keygen takes
  // 15-30s on mid-tier Android — if we wait until they open chat, that's where they
  // notice the wait. By kicking it off here, the work overlaps with them browsing
  // Home/Settings/Diary and chat is typically ready by the time they tap it.
  // Fire-and-forget; getOrCreateKeyPair has internal in-flight deduping so this won't
  // race with the chat screen's own call.
  const cryptoInitForUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    if (cryptoInitForUserRef.current === user.id) return;
    cryptoInitForUserRef.current = user.id;
    getOrCreateKeyPair().catch((err) => {
      console.warn('[Auth] background keygen failed', err);
    });
  }, [user?.id]);

  // Re-arm push on app foreground. iOS occasionally rotates the APNs device token, and
  // Android can revoke permission while we're backgrounded — re-running init is cheap.
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'active' && user?.id && notificationsEnabled) {
        initPushNotifications().catch(() => {});
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [user?.id, notificationsEnabled]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      isAuthenticated: !!user,
      isBootstrapping,
      notificationsEnabled,
      setUser,
      refreshProfile,
      logout,
      setNotificationsEnabled,
    }),
    [user, isBootstrapping, notificationsEnabled, setUser, refreshProfile, logout, setNotificationsEnabled]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
