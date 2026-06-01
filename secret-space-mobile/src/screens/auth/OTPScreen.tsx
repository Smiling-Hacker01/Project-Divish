import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, InlineHeader, Text, OTPInput, ProgressBar, Button } from '@/components';
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
  // Tracks the last code value we kicked off auto-submit for. Without this,
  // a stuck/failed submit (network hang, 401, server timeout) would leave
  // `submitting` resolved but with the same 6-digit code still in state,
  // and the next render would happily call submit() again in a loop. By
  // remembering "we already tried this code", auto-submit fires AT MOST
  // ONCE per filled code; if the user wants to retry the same code they
  // use the explicit Verify button (which clears this ref).
  const autoSubmittedFor = useRef<string | null>(null);

  useEffect(() => {
    // Kick off the OTP send on mount
    authApi.otpRequest().catch(() => {});
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  // submit is wrapped in useCallback so the auto-submit effect and the
  // manual Verify button share the same identity.
  const submit = useCallback(async () => {
    if (submitting) return;
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
          // Live in-flow navigation step: completeSignup persists the
          // onboarding flag (so an app-kill resume lands on CoupleCode
          // via AuthStack's initialRouteName), but in the live signup
          // flow the AuthStack is already mounted — initialRouteName is
          // honored ONLY on first mount per @react-navigation/native-stack,
          // so the persisted flag alone does nothing right now. Without
          // an explicit replace() here, the user sat on OTPScreen showing
          // 6 typed digits and no progress indicator (the bug they hit:
          // "OTP looked like it failed, force-killed app, then on relaunch
          // the persisted flag rescued them onto CoupleCode"). replace()
          // (not navigate) so the back button doesn't return to OTP — the
          // signup is already committed at this point.
          navigation.replace('CoupleCode');
        } else {
          await setUser(res.user);
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'That code did not match.');
      // Don't clear the code automatically — it's confusing when the user
      // entered the right thing and the server hiccupped (cold-start
      // timeout, network blip). Keeping the code lets them tap the Verify
      // button to retry without re-typing all 6 digits.
    } finally {
      setSubmitting(false);
    }
  }, [code, completeSignup, setUser, route.params?.mode, submitting]);

  // Auto-submit fires once per filled code value. If the submit fails the
  // ref still points to that code, so the user has to either change the
  // code (which clears the ref via the effect below) or tap Verify to
  // retry — preventing an infinite "fail → re-submit → fail" loop.
  useEffect(() => {
    if (code.length === 6 && !submitting && autoSubmittedFor.current !== code) {
      autoSubmittedFor.current = code;
      submit();
    }
  }, [code, submitting, submit]);

  // When the user edits the code (deletes a digit, retypes), clear the
  // auto-submit lock AND any previous error. This is the escape hatch for
  // a stuck submitting state — the user just deletes one digit, the lock
  // resets, retyping the digit re-triggers auto-submit.
  useEffect(() => {
    if (code.length < 6) {
      autoSubmittedFor.current = null;
      setError(null);
    }
  }, [code]);

  const onManualVerify = useCallback(() => {
    // Tapping Verify is the manual escape hatch — bypasses both the
    // submitting guard inside submit() AND the auto-submit dedup ref.
    // If something stranded the screen mid-submit, this gets the user out.
    autoSubmittedFor.current = code;
    setSubmitting(false); // belt + suspenders against a stuck state
    // Schedule submit on the next tick so the setSubmitting(false) above
    // lands before submit reads `submitting` in its guard.
    setTimeout(() => submit(), 0);
  }, [code, submit]);

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

        {/* Verify button — the manual escape hatch. Auto-submit still fires
            on a freshly-filled 6-digit code, so this button is invisible to
            the user 99% of the time (they fill the code, the auto-submit
            navigates them away before they ever see this). It shows up
            when: (a) the auto-submit failed and we kept the code, OR
            (b) the auto-submit got stuck somehow and the user needs to
            manually nudge it. Visible only when 6 digits are entered so
            we don't suggest tapping an incomplete code. */}
        {code.length === 6 && (
          <Button
            label={submitting ? 'Verifying…' : 'Verify code'}
            fullWidth
            style={{ marginTop: 20 }}
            loading={submitting}
            disabled={submitting}
            onPress={onManualVerify}
          />
        )}

        <View style={{ marginTop: 24, alignItems: 'center' }}>
          {submitting && code.length < 6 ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : secondsLeft > 0 ? (
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
