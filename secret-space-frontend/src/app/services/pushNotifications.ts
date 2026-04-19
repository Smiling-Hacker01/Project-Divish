import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { apiClient } from '../api/client';

/**
 * Initializes push notification registration and event handling.
 * Safe to call on web (gracefully no-ops if not on a native platform).
 * Should be called once after the user has logged in.
 */
export const initPushNotifications = async (): Promise<void> => {
  // Only run on native platforms (Android/iOS)
  if (!Capacitor.isNativePlatform()) {
    console.log('[Push] Not a native platform — skipping push registration');
    return;
  }

  try {
    // 1. Request permission
    const permResult = await PushNotifications.requestPermissions();

    if (permResult.receive !== 'granted') {
      console.warn('[Push] Permission not granted:', permResult.receive);
      return;
    }

    // 2. Register with FCM
    await PushNotifications.register();

    // 3. Listen for successful registration → send token to backend
    PushNotifications.addListener('registration', async (token) => {
      console.log('[Push] FCM token received:', token.value.substring(0, 20) + '...');

      try {
        await apiClient.put('/settings/fcm-token', { token: token.value });
        console.log('[Push] FCM token saved to backend');
      } catch (err) {
        console.error('[Push] Failed to save FCM token:', err);
      }
    });

    // 4. Registration error handler
    PushNotifications.addListener('registrationError', (err) => {
      console.error('[Push] Registration failed:', err);
    });

    // 5. Foreground notification — show an in-app alert or let the system handle it
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Foreground notification:', notification.title, notification.body);
      // The system notification tray will NOT show this by default on Android 
      // when the app is in the foreground. We can add a local notification here
      // if needed in the future, but the primary use case (background delivery)
      // is handled automatically by FCM.
    });

    // 6. User tapped a notification → navigate to the relevant screen
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[Push] Notification tapped:', action.notification.data);

      const url = action.notification.data?.url;
      if (url && typeof url === 'string') {
        // Use window.location for reliable navigation in Capacitor WebView
        window.location.href = url;
      }
    });

    console.log('[Push] Push notification listeners registered');
  } catch (err) {
    console.error('[Push] Initialization failed:', err);
  }
};
