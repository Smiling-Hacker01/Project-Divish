import React, { useCallback, useEffect, useState } from 'react';
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

SplashScreen.preventAutoHideAsync().catch(() => {});

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
          instead of zeros, preventing the broken first-frame where the TopBar would
          overlap the status bar before the async inset measurement arrived. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider>
          <AuthProvider>
            <ChatSocketProvider>
              <ThemedStatusBar />
              <RootNavigator />
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
