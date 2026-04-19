import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * Wires the Android hardware/gesture back button to React Router history.
 * - If the user is deeper than the root screen, goes back one route.
 * - If on the home/root screen, exits the app.
 * 
 * Safe to call on web — gracefully no-ops if not on a native platform.
 * Must be called once at app startup.
 */
export const initAndroidBackButton = (): void => {
  if (!Capacitor.isNativePlatform()) return;

  App.addListener('backButton', ({ canGoBack }) => {
    // canGoBack reflects the WebView's navigation stack depth
    if (canGoBack) {
      window.history.back();
    } else {
      // At root — exit the app gracefully
      App.exitApp();
    }
  });
};
