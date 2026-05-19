import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, InlineHeader, Text, Input, Button } from '@/components';
import { useTheme } from '@/theme';
import { authApi } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'JoinCode'>;

export function JoinCodeScreen({ navigation }: Props) {
  const theme = useTheme();
  const { setUser } = useAuth();
  const [code, setCode] = useState('');
  const [codeFocused, setCodeFocused] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Normalize the code as the user types. The canonical format is
  // `LOVE-XXX-XXX` (12 chars including dashes); we keep alphanumerics AND
  // dashes, force uppercase, and cap at the canonical length. Pasting the
  // full code (including the dashes) just works. Pasting whitespace-padded
  // input gets cleaned automatically.
  const handleCodeChange = (raw: string) => {
    const cleaned = raw.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase().slice(0, CODE_LEN);
    setCode(cleaned);
  };

  // Couple codes look like `LOVE-XXX-XXX` (12 chars including the two dashes).
  // We accept either the canonical form or just the suffix portion the partner
  // might share casually — the server uppercases + trims either way.
  const CODE_LEN = 12;

  const submit = async () => {
    if (code.length !== CODE_LEN || !name || !email || password.length < 8) {
      setError('Fill every field — the code looks like LOVE-XXX-XXX.');
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

          <View
            style={[
              styles.codeField,
              {
                backgroundColor: theme.colors.surface,
                borderColor: error && code.length !== CODE_LEN
                  ? 'rgba(232,99,122,0.65)'
                  : codeFocused
                    ? theme.colors.primary
                    : theme.colors.hairline,
                borderWidth: codeFocused || (error && code.length !== CODE_LEN) ? 1.5 : 1,
              },
            ]}
          >
            <TextInput
              value={code}
              onChangeText={handleCodeChange}
              onFocus={() => setCodeFocused(true)}
              onBlur={() => setCodeFocused(false)}
              placeholder="LOVE-XXX-XXX"
              placeholderTextColor={theme.colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              maxLength={CODE_LEN}
              style={[
                styles.codeInput,
                {
                  color: theme.colors.foreground,
                  fontFamily: theme.typography.mono?.fontFamily ?? 'JetBrainsMono_500Medium',
                  ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
                },
              ]}
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
  // 64pt height + 1.5pt border + 12pt vertical breathing room gives the code
  // entry visual gravity without taking over the screen. Monospaced font +
  // big letter-spacing makes a 6-char code feel like a code, not a word.
  codeField: {
    height: 64,
    borderRadius: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeInput: {
    width: '100%',
    // 12-char code (LOVE-XXX-XXX) needs a smaller font + spacing than a 6-char
    // OTP-style code so it fits comfortably on phone widths down to ~340 dp.
    fontSize: 22,
    letterSpacing: 2,
    textAlign: 'center',
    padding: 0,
  },
});
