import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, InlineHeader, Text, OTPInput, Input, Button } from '@/components';
import { useTheme } from '@/theme';
import { authApi } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'JoinCode'>;

export function JoinCodeScreen({ navigation }: Props) {
  const theme = useTheme();
  const { setUser } = useAuth();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (code.length !== 6 || !name || !email || password.length < 8) {
      setError('Fill every field — code must be 6 characters.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await authApi.join({ name, email, password, coupleCode: code });
      if (res.user) await setUser(res.user);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "That code didn't match. Double-check it with your partner.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer>
      <InlineHeader title="Join your partner" showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.wrap, { paddingHorizontal: theme.screenPadding }]}>
          <Text variant="h2" align="center" style={{ marginTop: 32 }}>
            Enter their code
          </Text>
          <Text variant="bodySmall" color="muted" align="center" style={{ marginTop: 8 }}>
            Ask your partner to share their code from Settings.
          </Text>

          <View style={{ marginTop: 40 }}>
            <OTPInput
              value={code}
              onChange={setCode}
              length={6}
              numerals="alphanumeric"
              uppercase
              error={!!error && code.length !== 6}
            />
          </View>

          <View style={{ marginTop: 32, gap: 16 }}>
            <Input label="Your name" value={name} onChangeText={setName} autoCapitalize="words" />
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          </View>

          {error && (
            <Text variant="bodySmall" color="destructive" align="center" style={{ marginTop: 16 }}>
              {error}
            </Text>
          )}

          <View style={{ marginTop: 'auto', paddingBottom: 24 }}>
            <Button label="Link our spaces" fullWidth onPress={submit} loading={loading} />
            <Button
              label="I don't have a code yet → Create our own space"
              variant="ghost"
              style={{ marginTop: 12 }}
              fullWidth
              onPress={() => navigation.replace('SignUp')}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 16 },
});
