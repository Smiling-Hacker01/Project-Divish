import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar, Text, Button, Input } from '@/components';
import { useTheme } from '@/theme';
import { vaultApi } from '@/api';
import { vaultUploadManager } from '@/services/vaultUploadManager';

export function VaultUnlockScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.05, duration: 1250, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1250, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  const tryFaceId = async () => {
    setError(null);
    setUnlocking(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        setError(
          !hasHardware
            ? 'No biometric hardware on this device.'
            : 'No biometric identity is enrolled. Use a password.'
        );
        setShowPasswordField(true);
        return;
      }

      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock the vault',
        fallbackLabel: 'Use password',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (!auth.success) {
        setError('Biometric check failed. Try a password.');
        setShowPasswordField(true);
        return;
      }
      await vaultApi.unlock();
      // Resume any uploads that were paused when the token expired mid-batch.
      vaultUploadManager.resumeAfterUnlock();
      navigation.replace('VaultGrid');
    } catch (e: any) {
      const status = e?.response?.status;
      const msg =
        e?.response?.data?.error ??
        (status === 401
          ? 'Your session expired. Please sign in again.'
          : e?.message?.includes('Network')
            ? 'Cannot reach the server. Is the backend running?'
            : 'Could not unlock right now.');
      setError(msg);
    } finally {
      setUnlocking(false);
    }
  };

  const tryPassword = async () => {
    setError(null);
    setUnlocking(true);
    try {
      await vaultApi.unlock(password);
      vaultUploadManager.resumeAfterUnlock();
      navigation.replace('VaultGrid');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'That password did not match.');
    } finally {
      setUnlocking(false);
    }
  };

  // Auto-prompt for biometrics on first focus so the user doesn't have to tap twice.
  // (They can still tap "Unlock with Face ID" again if they cancel.)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!cancelled && hasHardware && isEnrolled) tryFaceId();
    })();
    return () => {
      cancelled = true;
    };
    // Run only once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScreenContainer glowCorner="bottom-right" glowColor="gold" edges={['top', 'bottom']}>
      <TopBar showBack={false} />
      <View
        style={[
          styles.wrap,
          {
            paddingHorizontal: theme.screenPadding,
            // Reserve room for the floating bottom nav so the CTAs aren't covered.
            paddingBottom: theme.bottomNavReserve + 16,
          },
        ]}
      >
        <View style={styles.hero}>
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <View style={[styles.lockCircle, { borderColor: theme.colors.accent }]}>
              <Feather name="lock" size={40} color={theme.colors.accent} />
            </View>
          </Animated.View>
          <Text variant="h2" align="center" style={{ marginTop: 24 }}>
            Vault locked
          </Text>
          <Text variant="body" color="muted" align="center" style={{ marginTop: 8 }}>
            For your eyes — and theirs.
          </Text>
        </View>

        {showPasswordField && (
          <View style={{ marginTop: 32 }}>
            <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          </View>
        )}

        {error && (
          <Text variant="bodySmall" color="destructive" align="center" style={{ marginTop: 16 }}>
            {error}
          </Text>
        )}

        <View style={styles.ctas}>
          <Button
            label={showPasswordField ? 'Unlock' : 'Unlock with Face ID'}
            leadingIcon={showPasswordField ? 'unlock' : 'user-check'}
            fullWidth
            onPress={showPasswordField ? tryPassword : tryFaceId}
            loading={unlocking}
            disabled={showPasswordField && password.length === 0}
          />
          {!showPasswordField && (
            <Pressable onPress={() => setShowPasswordField(true)} style={{ marginTop: 16, alignSelf: 'center' }}>
              <Text variant="bodySmall" color="muted">
                Use password instead
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 32 },
  hero: { alignItems: 'center', marginTop: 48 },
  lockCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctas: { marginTop: 'auto', paddingBottom: 24 },
});
