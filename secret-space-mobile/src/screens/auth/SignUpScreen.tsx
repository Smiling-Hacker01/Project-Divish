import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { ScreenContainer, InlineHeader, Text, Input, Button, ProgressBar, SwitchRow } from '@/components';
import { useTheme } from '@/theme';
import { AuthStackParamList } from '@/navigation/types';
import { authApi } from '@/api';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export function SignUpScreen({ navigation }: Props) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [includeAnniversary, setIncludeAnniversary] = useState(false);
  const [anniversary, setAnniversary] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Please enter a valid email address.';
    if (password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (includeAnniversary && !/^\d{4}-\d{2}-\d{2}$/.test(anniversary))
      e.anniversary = 'Use YYYY-MM-DD format.';
    return e;
  };

  const onSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      setLoading(true);
      await authApi.signup({
        name: name.trim(),
        email: email.trim(),
        password,
        anniversaryDate: includeAnniversary ? anniversary : new Date().toISOString().slice(0, 10),
      });
      navigation.navigate('OTP', { mode: 'signup' });
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Could not create your space. Try again.';
      setErrors({ form: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer scroll={false}>
      <InlineHeader showBack centerElement={<ProgressBar total={3} current={1} />} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { paddingHorizontal: theme.screenPadding }]}
        >
          <Text variant="overline" color="muted">
            01
          </Text>
          <Text variant="h1" style={{ marginTop: 4 }}>
            Let's start with you
          </Text>
          <Text variant="body" color="muted" style={{ marginTop: 8 }}>
            A few details to set up your space.
          </Text>

          <View style={{ marginTop: 32, gap: 16 }}>
            <Input label="Name" value={name} onChangeText={setName} error={errors.name} autoCapitalize="words" />
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPwd}
              error={errors.password}
              trailingIcon={showPwd ? 'eye-off' : 'eye'}
              onTrailingPress={() => setShowPwd((s) => !s)}
            />
            <SwitchRow
              label="Add an anniversary"
              description="We'll keep a counter on your home screen."
              value={includeAnniversary}
              onValueChange={setIncludeAnniversary}
            />
            {includeAnniversary && (
              <Input
                label="Anniversary date"
                placeholder="YYYY-MM-DD"
                value={anniversary}
                onChangeText={setAnniversary}
                error={errors.anniversary}
                keyboardType="numbers-and-punctuation"
              />
            )}
            {errors.form && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="alert-circle" size={14} color={theme.colors.destructive} />
                <Text variant="bodySmall" color="destructive" style={{ marginLeft: 6 }}>
                  {errors.form}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingHorizontal: theme.screenPadding }]}>
          <Button label="Continue" fullWidth trailingIcon="arrow-right" onPress={onSubmit} loading={loading} />
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 8, paddingBottom: 32 },
  footer: { paddingBottom: 24, paddingTop: 12 },
});
