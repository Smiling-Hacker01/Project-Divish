import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from './types';
import { useAuth } from '@/context/AuthContext';
import { SplashScreen } from '@/screens/auth/SplashScreen';
import { SignUpScreen } from '@/screens/auth/SignUpScreen';
import { OTPScreen } from '@/screens/auth/OTPScreen';
import { FaceEnrollScreen } from '@/screens/auth/FaceEnrollScreen';
import { CoupleCodeScreen } from '@/screens/auth/CoupleCodeScreen';
import { InvitePartnerScreen } from '@/screens/auth/InvitePartnerScreen';
import { JoinCodeScreen } from '@/screens/auth/JoinCodeScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  // When the user is authenticated locally but hasn't finished the
  // CoupleCode reveal (mid-signup, possibly mid-app-kill resume), open the
  // stack directly on CoupleCode instead of Splash. Without this, killing
  // the app between OTP success and tapping "Continue" on CoupleCode would
  // strand the user on the welcome splash with no way back to the reveal.
  const { needsCoupleCodeReveal } = useAuth();
  const initialRouteName: keyof AuthStackParamList = needsCoupleCodeReveal ? 'CoupleCode' : 'Splash';

  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="OTP" component={OTPScreen} />
      <Stack.Screen name="FaceEnroll" component={FaceEnrollScreen} />
      <Stack.Screen name="CoupleCode" component={CoupleCodeScreen} />
      <Stack.Screen name="InvitePartner" component={InvitePartnerScreen} />
      <Stack.Screen name="JoinCode" component={JoinCodeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}
