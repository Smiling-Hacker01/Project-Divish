import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { settingsApi } from '@/api';

// In-foreground notifications should still raise a banner + sound (default behavior
// hides them). We set this once at module load so the handler is in place before the
// first event arrives.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let tapSubscription: Notifications.Subscription | null = null;
let receiveSubscription: Notifications.Subscription | null = null;
let registeredToken: string | null = null;

type TapHandler = (data: Record<string, unknown>) => void;
let onTapHandler: TapHandler | null = null;

export const setNotificationTapHandler = (fn: TapHandler | null) => {
  onTapHandler = fn;
};

const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#E8637A',
  });
};

const requestPermission = async (): Promise<boolean> => {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  // iOS returns `undetermined` until you ask once. Android 13+ also requires runtime grant.
  const ask = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return ask.granted;
};

// Returns the *raw FCM/APNs* device token, which the backend uses with firebase-admin.
// `getExpoPushTokenAsync` would return an Expo-routed token that the backend can't use.
// On iOS Simulator this throws; we catch and return null so the rest of init can no-op.
const getDeviceToken = async (): Promise<string | null> => {
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    return typeof token.data === 'string' ? token.data : null;
  } catch (err) {
    if (__DEV__) console.log('[Push] No device token (likely simulator):', (err as Error).message);
    return null;
  }
};

/**
 * Initialize push notifications. Idempotent — safe to call multiple times. Returns
 * true if a token was successfully registered with the backend during this call,
 * false otherwise (e.g. simulator, permission denied, no FCM config yet).
 */
export const initPushNotifications = async (): Promise<boolean> => {
  await ensureAndroidChannel();

  const granted = await requestPermission();
  if (!granted) {
    attachListeners();
    return false;
  }

  const token = await getDeviceToken();
  if (!token) {
    attachListeners();
    return false;
  }

  // Skip the network round-trip if we already pushed this exact token this session.
  if (token !== registeredToken) {
    try {
      await settingsApi.registerFcm(token);
      registeredToken = token;
    } catch (err) {
      console.warn('[Push] Failed to register FCM token with backend', err);
      // Don't return false — we still want the listeners attached so taps work if the
      // token was registered on a previous launch.
    }
  }

  attachListeners();
  return registeredToken === token;
};

const attachListeners = () => {
  if (!receiveSubscription) {
    receiveSubscription = Notifications.addNotificationReceivedListener((n) => {
      // Foreground notifications surface via the handler set at module top.
      // We log for diagnostics but don't need to do anything else here.
      if (__DEV__) console.log('[Push] received', n.request.content.title);
    });
  }
  if (!tapSubscription) {
    tapSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
      if (__DEV__) console.log('[Push] tapped', data);
      onTapHandler?.(data);
    });
  }
};

/**
 * Clear the listeners. Call on logout so a re-login attaches fresh ones tied to the
 * new auth context.
 */
export const teardownPushNotifications = (): void => {
  receiveSubscription?.remove();
  receiveSubscription = null;
  tapSubscription?.remove();
  tapSubscription = null;
  registeredToken = null;
};

/**
 * Programmatically clear the FCM token on the backend (e.g. when the user toggles
 * notifications off in settings). The backend treats an empty string as "no token"
 * via the same `messaging/invalid-registration-token` recovery path.
 */
export const unregisterPushNotifications = async (): Promise<void> => {
  try {
    await settingsApi.registerFcm(null);
  } catch {
    // Best-effort; we still clear locally.
  }
  registeredToken = null;
};
