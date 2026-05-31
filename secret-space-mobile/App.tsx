import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts as useFraunces, Fraunces_400Regular, Fraunces_500Medium } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { ThemeProvider, useTheme } from './src/theme';
import { AuthProvider } from './src/context/AuthContext';
import { ChatSocketProvider } from './src/context/ChatSocketContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ToastHost } from './src/components/Toast';

SplashScreen.preventAutoHideAsync().catch(() => {});

// `initialWindowMetrics` is occasionally `null` on the first launch after install
// or during a dev-client Metro reload (the native module reports metrics async, JS
// runs before the report arrives). When that happens, SafeAreaProvider falls back
// to its zero-inset-then-update behavior — the exact thing we're trying to avoid.
// This fallback gives us a synchronous best-guess so the very first React render
// has *some* correct top padding even in that edge case. On real devices the real
// metrics replace this within ~1 frame; the fallback is only ever load-bearing
// during the first paint.
const FALLBACK_INITIAL_METRICS = {
  frame: {
    x: 0,
    y: 0,
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  insets: {
    // Android: use the OS-reported status bar height. iOS: 44 covers notch + clock.
    top: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) : 44,
    bottom: Platform.OS === 'android' ? 0 : 34,
    left: 0,
    right: 0,
  },
};

export default function App() {
  const [fontsLoaded] = useFraunces({
    Fraunces_400Regular,
    Fraunces_500Medium,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_500Medium,
  });

  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    if (fontsLoaded) setAppReady(true);
  }, [fontsLoaded]);

  const onLayout = useCallback(async () => {
    if (appReady) await SplashScreen.hideAsync().catch(() => {});
  }, [appReady]);

  if (!appReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayout}>
      {/* `initialMetrics` makes the very first render use real native-measured insets
          instead of zeros. When that value is null (rare but real — fresh install or
          dev-client Metro reload race), we substitute a synchronous best-guess so the
          first paint never has overlapping-status-bar broken state. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics ?? FALLBACK_INITIAL_METRICS}>
        <ThemeProvider>
          <AuthProvider>
            <ChatSocketProvider>
              <ThemedStatusBar />
              <RootNavigator />
              {/* ToastHost sits at the root so toast.success(...) calls from
                  any screen render above all navigation surfaces. Positioned
                  via absolute layout (see Toast.tsx) so it overlays anything
                  including the floating tab bar. */}
              <ToastHost />
            </ChatSocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStatusBar() {
  const theme = useTheme();
  return <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />;
}
