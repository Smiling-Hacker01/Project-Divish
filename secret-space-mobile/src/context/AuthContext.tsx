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
import { clearEpochSession } from '@/services/chatEpochs';
import { clearDeviceIdentity } from '@/services/deviceIdentity';
import { chatQueue } from '@/services/chatQueue';
import { diaryQueue } from '@/services/diaryQueue';

const USER_KEY = 'secretspace.user';
const NOTIF_PREF_KEY = 'secretspace.notificationsEnabled';
// Persisted onboarding gate: when true, the user has finished signup + MFA
// but hasn't seen the CoupleCode reveal screen yet. isAuthenticated stays
// false until this is cleared, which keeps the navigator on the AuthStack
// so CoupleCode actually renders. Persisted so a mid-onboarding app kill
// resumes correctly instead of stranding the user (token in storage but
// CoupleCode never seen) on Splash.
const ONBOARDING_KEY = 'secretspace.needsCoupleCodeReveal';

interface AuthCtx {
  user: User | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  notificationsEnabled: boolean;
  // True while a fresh initiator hasn't yet been shown their couple code.
  // RootNavigator reads this to keep them on AuthStack post-MFA so the
  // CoupleCode screen actually has a chance to render before they land on
  // Home. Cleared by completeCoupleCodeReveal().
  needsCoupleCodeReveal: boolean;
  setUser: (u: User | null) => Promise<void>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  setNotificationsEnabled: (v: boolean) => Promise<void>;
  // Called by OTPScreen after a SIGNUP-mode verify succeeds for a fresh
  // initiator whose couple is still in 'waiting' state. Persists the user
  // AND raises the onboarding flag in one go so RootNavigator doesn't
  // briefly flip to Main and back.
  completeSignup: (u: User) => Promise<void>;
  // Called by CoupleCodeScreen / InvitePartnerScreen when the user is ready
  // to leave the onboarding flow and enter the main app.
  completeCoupleCodeReveal: () => Promise<void>;
}

const Context = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [needsCoupleCodeReveal, setNeedsCoupleCodeRevealState] = useState(false);
  const pushInitForUserRef = useRef<string | null>(null);

  const setUser = useCallback(async (u: User | null) => {
    setUserState(u);
    if (u) await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
    else await AsyncStorage.removeItem(USER_KEY);
  }, []);

  // Atomic: persist user + raise onboarding flag in one path. Order matters —
  // we set state for the flag first so React doesn't briefly evaluate
  // isAuthenticated as `!!u && !false` (= true) on the next render before the
  // flag write lands. By batching both setStates in the same synchronous
  // block, React combines them into a single render where isAuthenticated
  // evaluates to false (needsCoupleCodeReveal: true).
  const completeSignup = useCallback(async (u: User) => {
    setNeedsCoupleCodeRevealState(true);
    setUserState(u);
    await Promise.all([
      AsyncStorage.setItem(USER_KEY, JSON.stringify(u)),
      AsyncStorage.setItem(ONBOARDING_KEY, '1'),
    ]);
  }, []);

  const completeCoupleCodeReveal = useCallback(async () => {
    setNeedsCoupleCodeRevealState(false);
    await AsyncStorage.removeItem(ONBOARDING_KEY);
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
    clearEpochSession();
    // Drop the previous user's keypair AND every pending write so the next account
    // on this device gets a fresh identity and isn't haunted by orphan sends or
    // diary drafts from a couple that may have been dissolved.
    await clearKeyPair().catch(() => undefined);
    await clearDeviceIdentity();
    await chatQueue.clear().catch(() => undefined);
    await diaryQueue.clear().catch(() => undefined);
    pushInitForUserRef.current = null;
    await authApi.logout();
    // Clear the onboarding flag on logout too — the next account on this
    // device should start clean rather than inheriting a half-finished
    // signup from someone else.
    setNeedsCoupleCodeRevealState(false);
    await AsyncStorage.removeItem(ONBOARDING_KEY).catch(() => undefined);
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
      clearEpochSession();
      void clearKeyPair();
      void clearDeviceIdentity();
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
        const [storedUser, accessToken, notifPref, onboardingPending] = await Promise.all([
          AsyncStorage.getItem(USER_KEY),
          tokens.getAccess(),
          AsyncStorage.getItem(NOTIF_PREF_KEY),
          AsyncStorage.getItem(ONBOARDING_KEY),
        ]);
        if (notifPref === '0') setNotificationsEnabledState(false);
        // Restore the onboarding flag BEFORE the user object so that the
        // first render after bootstrap evaluates isAuthenticated correctly.
        if (onboardingPending === '1') setNeedsCoupleCodeRevealState(true);
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
      // isAuthenticated is gated on the onboarding flag so a fresh signup
      // doesn't blow past CoupleCode straight into Main. The flag is cleared
      // by completeCoupleCodeReveal() once the user dismisses the screen.
      isAuthenticated: !!user && !needsCoupleCodeReveal,
      isBootstrapping,
      notificationsEnabled,
      needsCoupleCodeReveal,
      setUser,
      refreshProfile,
      logout,
      setNotificationsEnabled,
      completeSignup,
      completeCoupleCodeReveal,
    }),
    [
      user,
      needsCoupleCodeReveal,
      isBootstrapping,
      notificationsEnabled,
      setUser,
      refreshProfile,
      logout,
      setNotificationsEnabled,
      completeSignup,
      completeCoupleCodeReveal,
    ]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
