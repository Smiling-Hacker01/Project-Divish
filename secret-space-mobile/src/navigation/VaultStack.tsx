import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { VaultUnlockScreen } from '@/screens/vault/VaultUnlockScreen';
import { VaultGridScreen } from '@/screens/vault/VaultGridScreen';
import { VaultStackParamList } from './types';

const Stack = createNativeStackNavigator<VaultStackParamList>();

export function VaultStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="VaultUnlock" component={VaultUnlockScreen} />
      <Stack.Screen name="VaultGrid" component={VaultGridScreen} />
    </Stack.Navigator>
  );
}
