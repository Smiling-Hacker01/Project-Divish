import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ScreenContainer, TopBar, Text, Input, Button } from '@/components';
import { useTheme } from '@/theme';
import { authApi } from '@/api';

export function ForgotPasswordScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    await authApi.forgotPassword(email);
    setLoading(false);
    setSent(true);
  };

  if (sent) {
    return (
      <ScreenContainer>
        <TopBar title="Reset password" />
        <View style={[styles.wrap, { paddingHorizontal: theme.screenPadding }]}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: 'rgba(126,175,160,0.16)', borderColor: theme.colors.success },
            ]}
          >
            <Feather name="check" size={32} color={theme.colors.success} />
          </View>
          <Text variant="h2" align="center" style={{ marginTop: 24 }}>
            Check your inbox
          </Text>
          <Text variant="body" color="muted" align="center" style={{ marginTop: 8 }}>
            We sent a reset link to{' '}
            <Text variant="body" weight="semibold">
              {email}
            </Text>
            .
          </Text>
          <Button label="Open mail app" fullWidth style={{ marginTop: 32 }} leadingIcon="mail" />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <TopBar title="Reset password" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.wrap, { paddingHorizontal: theme.screenPadding }]}>
          <Text variant="h2">Forgot password?</Text>
          <Text variant="body" color="muted" style={{ marginTop: 8 }}>
            We'll email you a link to reset it.
          </Text>
          <View style={{ marginTop: 32 }}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={{ marginTop: 'auto', paddingBottom: 24 }}>
            <Button label="Send reset link" fullWidth onPress={submit} loading={loading} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 32, alignItems: 'stretch' },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
});
