import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from './types';
import { SplashScreen } from '@/screens/auth/SplashScreen';
import { SignUpScreen } from '@/screens/auth/SignUpScreen';
import { OTPScreen } from '@/screens/auth/OTPScreen';
import { FaceEnrollScreen } from '@/screens/auth/FaceEnrollScreen';
import { CoupleCodeScreen } from '@/screens/auth/CoupleCodeScreen';
import { JoinCodeScreen } from '@/screens/auth/JoinCodeScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="OTP" component={OTPScreen} />
      <Stack.Screen name="FaceEnroll" component={FaceEnrollScreen} />
      <Stack.Screen name="CoupleCode" component={CoupleCodeScreen} />
      <Stack.Screen name="JoinCode" component={JoinCodeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}
