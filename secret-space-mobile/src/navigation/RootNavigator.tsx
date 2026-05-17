import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
  NavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '@/theme';
import { useAuth } from '@/context/AuthContext';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { RootStackParamList } from './types';
import { MoodCheckInScreen } from '@/screens/home/MoodCheckInScreen';
import { DiaryCreateScreen } from '@/screens/diary/DiaryCreateScreen';
import { DiaryDetailScreen } from '@/screens/diary/DiaryDetailScreen';
import { ChatScreen } from '@/screens/chat/ChatScreen';
import { CouponCreateScreen } from '@/screens/coupons/CouponCreateScreen';
import { CouponDetailScreen } from '@/screens/coupons/CouponDetailScreen';
import { AddReasonScreen } from '@/screens/lovebot/AddReasonScreen';
import { SettingsScreen } from '@/screens/settings/SettingsScreen';
import { ChangePasswordScreen } from '@/screens/settings/ChangePasswordScreen';
import { FaceReenrollScreen } from '@/screens/settings/FaceReenrollScreen';
import { AboutScreen } from '@/screens/settings/AboutScreen';
import { DailyLoginScreen } from '@/screens/streak/DailyLoginScreen';
import { setNotificationTapHandler } from '@/services/push';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const theme = useTheme();
  const { isAuthenticated, isBootstrapping } = useAuth();
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  const navTheme = {
    ...(theme.scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.scheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.colors.background,
      card: theme.colors.background,
      primary: theme.colors.primary,
      text: theme.colors.foreground,
      border: theme.colors.hairline,
    },
  };

  // Route push-notification taps to the right screen. The backend embeds a `type` field
  // in the FCM data payload — chat messages and LoveBot notes both currently open the
  // chat / home, which mirrors the web implementation.
  useEffect(() => {
    setNotificationTapHandler((data) => {
      const type = typeof data?.type === 'string' ? data.type : null;
      if (!navRef.current) return;
      if (type === 'chat_message') navRef.current.navigate('Chat');
      else if (type === 'lovebot' || (typeof data?.url === 'string' && data.url.includes('/home'))) {
        navRef.current.navigate('Main', { screen: 'Home' } as any);
      }
    });
    return () => setNotificationTapHandler(null);
  }, []);

  if (isBootstrapping) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme} ref={navRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="MoodCheckIn" component={MoodCheckInScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="DiaryCreate" component={DiaryCreateScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="DiaryDetail" component={DiaryDetailScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="CouponCreate" component={CouponCreateScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="CouponDetail" component={CouponDetailScreen} />
            <Stack.Screen name="AddReason" component={AddReasonScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="FaceReenroll" component={FaceReenrollScreen} />
            <Stack.Screen name="About" component={AboutScreen} />
            <Stack.Screen
              name="DailyLogin"
              component={DailyLoginScreen}
              options={{ presentation: 'transparentModal', animation: 'fade' }}
            />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
