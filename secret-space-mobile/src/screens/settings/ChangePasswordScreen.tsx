import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer, InlineHeader, Text, Button, Input, OTPInput } from '@/components';
import { useTheme } from '@/theme';
import { settingsApi } from '@/api';

/**
 * Three-stage password change flow:
 *
 *   1. CURRENT_PASSWORD → verify the user really knows the existing password.
 *      The new password is collected here too (in a "Repeat new password" gate)
 *      so we only have to ask once and confirm in-flight typos before sending.
 *      The backend pre-bcrypts the new password at this step and stashes the
 *      hash + an OTP code in Redis (10-min TTL).
 *
 *   2. OTP → the user enters the 6-digit code emailed to them. Backend verifies
 *      against the Redis-stored OTP; success commits the new password hash.
 *
 *   3. DONE → success card with a confirmation button that pops us back to
 *      Settings.
 *
 * Why two server round-trips + OTP: a stolen JWT alone shouldn't be enough to
 * pivot a session into a permanent account takeover. The OTP forces the attacker
 * to also control the user's email — same threat model the login flow uses.
 */

type Stage = 'enter' | 'verify' | 'done';

export function ChangePasswordScreen() {
  const theme = useTheme();
  const navigation = useNavigation();

  const [stage, setStage] = useState<Stage>('enter');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [otp, setOtp] = useState('');
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newPasswordValid = newPassword.length >= 8 && newPassword === confirmNew;
  const stage1Valid = currentPassword.length > 0 && newPasswordValid;

  const submitInit = async () => {
    if (!stage1Valid || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await settingsApi.initPasswordChange({ currentPassword, newPassword });
      setMaskedEmail(result.email);
      setStage('verify');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Could not start password change.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitConfirm = async () => {
    if (otp.length < 6 || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await settingsApi.confirmPasswordChange({ otp });
      setStage('done');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Could not confirm the code.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer scroll={false}>
      <InlineHeader title="Change password" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingTop: 16,
            paddingBottom: 48,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {stage === 'enter' && (
            <View>
              <Text variant="bodySmall" color="muted" style={{ marginBottom: 24 }}>
                Enter your current password, then your new one. We'll email a 6-digit code
                to confirm the change.
              </Text>
              <View style={{ gap: 16 }}>
                <Input
                  label="Current password"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Input
                  label="New password (8+ characters)"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={newPassword.length > 0 && newPassword.length < 8 ? 'Too short' : null}
                />
                <Input
                  label="Repeat new password"
                  value={confirmNew}
                  onChangeText={setConfirmNew}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={confirmNew.length > 0 && confirmNew !== newPassword ? "Doesn't match" : null}
                />
              </View>
              {error && (
                <Text variant="bodySmall" color="destructive" style={{ marginTop: 16 }}>
                  {error}
                </Text>
              )}
              <Button
                label="Send verification code"
                fullWidth
                style={{ marginTop: 24 }}
                onPress={submitInit}
                loading={submitting}
                disabled={!stage1Valid}
              />
            </View>
          )}

          {stage === 'verify' && (
            <View>
              <View style={[styles.heroIcon, { borderColor: theme.colors.accent }]}>
                <Feather name="mail" size={28} color={theme.colors.accent} />
              </View>
              <Text variant="h2" align="center" style={{ marginTop: 16 }}>
                Check your email
              </Text>
              <Text variant="bodySmall" color="muted" align="center" style={{ marginTop: 8 }}>
                We sent a 6-digit code to {maskedEmail ?? 'your inbox'}. It expires in 10 minutes.
              </Text>
              <View style={{ marginTop: 32 }}>
                <OTPInput value={otp} onChange={setOtp} length={6} autoFocus />
              </View>
              {error && (
                <Text variant="bodySmall" color="destructive" align="center" style={{ marginTop: 16 }}>
                  {error}
                </Text>
              )}
              <Button
                label="Confirm new password"
                fullWidth
                style={{ marginTop: 24 }}
                onPress={submitConfirm}
                loading={submitting}
                disabled={otp.length < 6}
              />
              <Button
                label="Back"
                variant="ghost"
                fullWidth
                style={{ marginTop: 8 }}
                onPress={() => {
                  setStage('enter');
                  setOtp('');
                  setError(null);
                }}
              />
            </View>
          )}

          {stage === 'done' && (
            <View>
              <View style={[styles.heroIcon, { borderColor: theme.colors.success }]}>
                <Feather name="check" size={28} color={theme.colors.success} />
              </View>
              <Text variant="h2" align="center" style={{ marginTop: 16 }}>
                Password updated
              </Text>
              <Text variant="bodySmall" color="muted" align="center" style={{ marginTop: 8 }}>
                You'll use your new password the next time you sign in. Your current
                session stays active on this device.
              </Text>
              <Button
                label="Back to settings"
                fullWidth
                style={{ marginTop: 32 }}
                onPress={() => {
                  if (navigation.canGoBack()) navigation.goBack();
                }}
                leadingIcon="arrow-left"
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heroIcon: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
});
