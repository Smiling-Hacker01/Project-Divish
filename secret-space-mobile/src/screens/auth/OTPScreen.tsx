import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, InlineHeader, Text, OTPInput, ProgressBar } from '@/components';
import { useTheme } from '@/theme';
import { authApi } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'OTP'>;

export function OTPScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const { setUser, completeSignup } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(42);

  useEffect(() => {
    // Kick off the OTP send on mount
    authApi.otpRequest().catch(() => {});
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  useEffect(() => {
    if (code.length === 6 && !submitting) submit();
  }, [code]);

  const submit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      const res = await authApi.otpVerify(code);
      if (res.user) {
        // Branch on the route mode + couple state. SIGNUP-mode users whose
        // couple is still in 'waiting' (no partner joined) need to see the
        // CoupleCode reveal screen BEFORE landing on Main — calling the
        // dedicated completeSignup path raises the onboarding flag so
        // RootNavigator keeps them on the AuthStack until CoupleCode's
        // dismiss handler clears it. LOGIN-mode users (and the rare signup
        // who somehow lands here with an active couple) go straight to Main
        // via the standard setUser.
        const isSignupWaiting =
          route.params?.mode === 'signup' && res.user.coupleStatus === 'waiting';
        if (isSignupWaiting) {
          await completeSignup(res.user);
        } else {
          await setUser(res.user);
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'That code did not match.');
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    try {
      await authApi.otpRequest();
      setSecondsLeft(42);
    } catch {
      setError('Could not resend right now.');
    }
  };

  return (
    <ScreenContainer>
      <InlineHeader showBack centerElement={<ProgressBar total={4} current={2} />} />
      <View style={[styles.wrap, { paddingHorizontal: theme.screenPadding }]}>
        <View style={styles.hero}>
          <View style={[styles.iconCircle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairlineStrong }]}>
            <Feather name="mail" size={32} color={theme.colors.primary} />
          </View>
          <Text variant="h2" align="center" style={{ marginTop: 24 }}>
            Check your email
          </Text>
          <Text variant="body" color="muted" align="center" style={{ marginTop: 8 }}>
            We sent a 6-digit code.
          </Text>
        </View>

        <View style={{ marginTop: 40 }}>
          <OTPInput value={code} onChange={setCode} length={6} error={!!error} />
          {error && (
            <Text variant="bodySmall" color="destructive" align="center" style={{ marginTop: 12 }}>
              {error}
            </Text>
          )}
        </View>

        <View style={{ marginTop: 32, alignItems: 'center' }}>
          {secondsLeft > 0 ? (
            <Text variant="bodySmall" color="muted">
              Resend code in {String(Math.floor(secondsLeft / 60)).padStart(1, '0')}:
              {String(secondsLeft % 60).padStart(2, '0')}
            </Text>
          ) : (
            <Pressable onPress={resend}>
              <Text variant="bodySmall" color="primary" weight="semibold">
                Resend code
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.footer}>
          <Pressable onPress={() => navigation.goBack()}>
            <Text variant="bodySmall" color="muted" align="center">
              Wrong email? Go back
            </Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 32 },
  hero: { alignItems: 'center' },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { marginTop: 'auto', paddingBottom: 32 },
});
