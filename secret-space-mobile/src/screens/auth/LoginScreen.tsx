import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ScreenContainer,
  InlineHeader,
  Text,
  Input,
  Button,
  BrandMark,
  Card,
  OTPInput,
} from '@/components';
import { useTheme } from '@/theme';
import { authApi } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { AuthStackParamList } from '@/navigation/types';

type Mode = 'email' | 'method-pick' | 'face-password' | 'password-only' | 'face-scan' | 'otp';
type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const theme = useTheme();
  const { setUser } = useAuth();

  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'verified' | 'failed'>('idle');

  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const ringSpin = useRef(new Animated.Value(0)).current;

  // TopBar back becomes mode-aware so we never render two back buttons on the same
  // screen. Sub-modes walk back through the state machine, root mode (`email`) goes
  // up the navigation stack.
  const handleTopBack = () => {
    if (mode === 'method-pick') return setMode('email');
    if (mode === 'face-password' || mode === 'password-only') return setMode('method-pick');
    if (mode === 'face-scan') return setMode('face-password');
    if (mode === 'otp') return setMode('method-pick');
    if (navigation.canGoBack()) navigation.goBack();
  };

  const maskedEmail = email
    ? `${email.charAt(0)}•••@${email.split('@')[1] ?? ''}`
    : '';

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const id = setInterval(() => setLockoutSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [lockoutSeconds]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  useEffect(() => {
    Animated.loop(
      Animated.timing(ringSpin, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [ringSpin]);

  const handleApiError = (err: any) => {
    const status = err?.response?.status;
    if (status === 429) {
      const retry = Number(err?.response?.headers?.['retry-after']) || 900;
      setLockoutSeconds(retry);
      setError(null);
      return;
    }
    setError(
      err?.response?.data?.error ??
        (err?.message?.includes('Network')
          ? 'Cannot reach the server. Is the backend running?'
          : 'Something went wrong. Please try again.')
    );
  };

  const submitEmail = () => {
    setError(null);
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    setEmail(trimmed);
    setMode('method-pick');
  };

  // Step 1: email + password → tempToken (or full session if MFA disabled).
  const runStep1 = async (): Promise<{ ok: boolean; isFaceMfa: boolean; loggedIn?: boolean }> => {
    setError(null);
    if (!password) {
      setError('Please enter your password.');
      return { ok: false, isFaceMfa: false };
    }
    setLoading(true);
    try {
      const res: any = await authApi.login({ email, password });
      // Some backends short-circuit and return tokens directly when MFA is off.
      if (res.accessToken && res.user) {
        await setUser(res.user);
        return { ok: true, isFaceMfa: false, loggedIn: true };
      }
      const isFaceMfa = res.mfaMethod === 'face' || !!res.user?.faceMFAEnabled;
      return { ok: !!res.tempToken, isFaceMfa };
    } catch (err: any) {
      handleApiError(err);
      return { ok: false, isFaceMfa: false };
    } finally {
      setLoading(false);
    }
  };

  const onFacePasswordContinue = async () => {
    const { ok, isFaceMfa, loggedIn } = await runStep1();
    if (loggedIn) return;
    if (!ok) return;
    if (!isFaceMfa) {
      setError('No face ID set up for this account. Try password and OTP instead.');
      return;
    }
    setMode('face-scan');
    setScanState('idle');
    if (!permission?.granted) await requestPermission();
  };

  const onPasswordOnlyContinue = async () => {
    const { ok, loggedIn } = await runStep1();
    if (loggedIn) return;
    if (!ok) return;
    setMode('otp');
    try {
      await authApi.otpRequest();
      setResendCooldown(60);
    } catch (err) {
      handleApiError(err);
    }
  };

  const captureFace = async () => {
    if (!cameraRef.current) return;
    setError(null);
    setScanState('scanning');
    setLoading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
      if (!photo?.base64) throw new Error('No image captured');
      const res = await authApi.faceVerify(photo.base64);
      if (res.user) {
        setScanState('verified');
        await setUser(res.user);
      } else {
        throw new Error('Verification failed');
      }
    } catch (err: any) {
      setScanState('failed');
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) {
      setError('Please enter all 6 digits.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.otpVerify(otp);
      if (res.user) await setUser(res.user);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    try {
      await authApi.otpRequest();
      setResendCooldown(60);
    } catch (err) {
      handleApiError(err);
    }
  };

  // ──────────────── Lockout state ────────────────
  if (lockoutSeconds > 0) {
    return (
      <ScreenContainer glowCorner="top-left">
        <InlineHeader showBack onBack={handleTopBack} centerElement={<BrandMark size={28} animated={false} />} />
        <View style={[styles.wrap, { paddingHorizontal: theme.screenPadding, justifyContent: 'center' }]}>
          <Card variant="tinted-rose" style={{ alignItems: 'center', padding: 32 }}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary },
              ]}
            >
              <Feather name="clock" size={32} color={theme.colors.primary} />
            </View>
            <Text variant="h2" align="center" style={{ marginTop: 24 }}>
              Take a breath
            </Text>
            <Text variant="body" color="muted" align="center" style={{ marginTop: 8 }}>
              Too many tries. Try again in
            </Text>
            <Text variant="numeralLarge" color="primary" align="center" style={{ marginTop: 12 }}>
              {String(Math.floor(lockoutSeconds / 60)).padStart(2, '0')}:
              {String(lockoutSeconds % 60).padStart(2, '0')}
            </Text>
          </Card>
        </View>
      </ScreenContainer>
    );
  }

  // ──────────────── Render by mode ────────────────
  return (
    <ScreenContainer>
      <InlineHeader showBack onBack={handleTopBack} centerElement={<BrandMark size={28} animated={false} />} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.wrap, { paddingHorizontal: theme.screenPadding }]}>
          {mode === 'email' && (
            <>
              <View style={styles.hero}>
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairlineStrong },
                  ]}
                >
                  <Feather name="lock" size={28} color={theme.colors.primary} />
                </View>
                <Text variant="h2" align="center" style={{ marginTop: 24 }}>
                  Welcome back
                </Text>
                <Text variant="body" color="muted" align="center" style={{ marginTop: 8 }}>
                  Enter your email to continue
                </Text>
              </View>

              <View style={{ marginTop: 32 }}>
                <Input
                  placeholder="Email"
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    setError(null);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="next"
                  onSubmitEditing={submitEmail}
                />
                {error && (
                  <Text variant="bodySmall" color="destructive" style={{ marginTop: 8 }}>
                    {error}
                  </Text>
                )}
              </View>

              <View style={{ marginTop: 32, paddingBottom: 24 }}>
                <Button label="Continue" fullWidth onPress={submitEmail} disabled={!email.trim()} />
                <Pressable
                  onPress={() => navigation.navigate('Splash' as never)}
                  style={{ alignSelf: 'center', marginTop: 24 }}
                >
                  <Text variant="bodySmall" color="muted">
                    Don't have an account?{' '}
                    <Text variant="bodySmall" color="primary" weight="semibold">
                      Sign up
                    </Text>
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {mode === 'method-pick' && (
            <>
              <View style={{ marginTop: 16 }}>
                <Text variant="h2" align="center">
                  Choose login method
                </Text>
                <Text variant="bodySmall" color="muted" align="center" style={{ marginTop: 8 }}>
                  Logging in as{' '}
                  <Text variant="bodySmall" weight="semibold">
                    {maskedEmail}
                  </Text>
                </Text>
              </View>

              <View style={{ marginTop: 32, gap: 12 }}>
                <MethodCard
                  icon="user-check"
                  title="Face + Password"
                  body="Quick face verification"
                  highlight
                  onPress={() => {
                    setPassword('');
                    setError(null);
                    setMode('face-password');
                  }}
                />
                <MethodCard
                  icon="key"
                  title="Password and OTP"
                  body="Use your password and a code we email you"
                  onPress={() => {
                    setPassword('');
                    setError(null);
                    setMode('password-only');
                  }}
                />
              </View>
            </>
          )}

          {(mode === 'face-password' || mode === 'password-only') && (
            <>
              <Text variant="h2" style={{ marginTop: 16 }}>
                Enter password
              </Text>
              <Text variant="body" color="muted" style={{ marginTop: 8 }}>
                {mode === 'face-password'
                  ? "Then we'll verify your face."
                  : "We'll send an OTP to your email after."}
              </Text>

              <View style={{ marginTop: 32 }}>
                <Input
                  placeholder="Password"
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    setError(null);
                  }}
                  secureTextEntry={!showPwd}
                  trailingIcon={showPwd ? 'eye-off' : 'eye'}
                  onTrailingPress={() => setShowPwd((s) => !s)}
                  autoComplete="password"
                  autoFocus
                />
                {error && (
                  <Text variant="bodySmall" color="destructive" style={{ marginTop: 8 }}>
                    {error}
                  </Text>
                )}
              </View>

              <View style={{ marginTop: 32, paddingBottom: 24 }}>
                <Button
                  label={mode === 'face-password' ? 'Continue to face scan' : 'Login'}
                  fullWidth
                  loading={loading}
                  disabled={!password}
                  onPress={mode === 'face-password' ? onFacePasswordContinue : onPasswordOnlyContinue}
                />
              </View>
            </>
          )}

          {mode === 'face-scan' && (
            <>
              <Text variant="h2" align="center" style={{ marginTop: 16 }}>
                Face verification
              </Text>
              <Text variant="bodySmall" color="muted" align="center" style={{ marginTop: 8 }}>
                Position your face in the frame
              </Text>

              <View style={styles.viewfinderWrap}>
                <Animated.View
                  style={[
                    styles.viewfinderRing,
                    {
                      borderColor:
                        scanState === 'verified' ? theme.colors.success : 'transparent',
                      transform: [
                        {
                          rotate: ringSpin.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '360deg'],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  {scanState !== 'verified' && (
                    <LinearGradient
                      colors={[
                        'rgba(232,99,122,0)',
                        '#E8637A',
                        '#C9A96E',
                        'rgba(201,169,110,0)',
                      ]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
                    />
                  )}
                </Animated.View>
                <View style={[styles.viewfinder, { backgroundColor: '#000' }]}>
                  {permission?.granted ? (
                    <CameraView ref={cameraRef} facing="front" style={StyleSheet.absoluteFill} />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.center]}>
                      <Text variant="bodySmall" color="muted">
                        Camera permission needed.
                      </Text>
                    </View>
                  )}
                  {scanState === 'verified' && (
                    <View style={[StyleSheet.absoluteFill, styles.center]}>
                      <Feather name="check-circle" size={56} color={theme.colors.success} />
                    </View>
                  )}
                  {scanState === 'failed' && (
                    <View style={[StyleSheet.absoluteFill, styles.center]}>
                      <Feather name="alert-circle" size={56} color="#F59E0B" />
                    </View>
                  )}
                </View>
              </View>

              {error && (
                <Text variant="bodySmall" color="destructive" align="center" style={{ marginTop: 8 }}>
                  {error}
                </Text>
              )}

              <View style={{ marginTop: 'auto', paddingBottom: 24, gap: 12 }}>
                <Button
                  label={scanState === 'scanning' ? 'Verifying…' : 'Capture & verify'}
                  fullWidth
                  onPress={captureFace}
                  loading={loading || scanState === 'scanning'}
                  disabled={scanState === 'verified'}
                />
                {scanState === 'failed' && (
                  <Button
                    label="Use OTP instead"
                    variant="secondary"
                    fullWidth
                    onPress={async () => {
                      setMode('otp');
                      try {
                        await authApi.otpRequest();
                        setResendCooldown(60);
                      } catch (e) {
                        handleApiError(e);
                      }
                    }}
                  />
                )}
              </View>
            </>
          )}

          {mode === 'otp' && (
            <>
              <View style={[styles.hero, { marginTop: 16 }]}>
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairlineStrong },
                  ]}
                >
                  <Feather name="mail" size={28} color={theme.colors.primary} />
                </View>
                <Text variant="h2" align="center" style={{ marginTop: 24 }}>
                  Verify with OTP
                </Text>
                <Text variant="bodySmall" color="muted" align="center" style={{ marginTop: 8 }}>
                  We sent a 6-digit code to
                </Text>
                <Text variant="bodySmall" weight="semibold" align="center" style={{ marginTop: 4 }}>
                  {maskedEmail}
                </Text>
              </View>

              <View style={{ marginTop: 32 }}>
                <OTPInput value={otp} onChange={setOtp} length={6} error={!!error} />
                {error && (
                  <Text variant="bodySmall" color="destructive" align="center" style={{ marginTop: 12 }}>
                    {error}
                  </Text>
                )}
              </View>

              <View style={{ marginTop: 24, alignItems: 'center' }}>
                {resendCooldown > 0 ? (
                  <Text variant="bodySmall" color="muted">
                    Resend OTP in{' '}
                    <Text variant="bodySmall" weight="semibold">
                      {resendCooldown}s
                    </Text>
                  </Text>
                ) : (
                  <Pressable onPress={resendOtp}>
                    <Text variant="bodySmall" color="primary" weight="semibold">
                      Resend OTP
                    </Text>
                  </Pressable>
                )}
              </View>

              <View style={{ marginTop: 32, paddingBottom: 24 }}>
                <Button
                  label="Verify OTP"
                  fullWidth
                  onPress={verifyOtp}
                  loading={loading}
                  disabled={otp.length !== 6}
                />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function MethodCard({
  icon,
  title,
  body,
  highlight,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  highlight?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress}>
      <View
        style={[
          styles.methodCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: highlight ? 'rgba(232,99,122,0.45)' : theme.colors.hairline,
            borderWidth: highlight ? 1.5 : 1,
            overflow: 'hidden',
          },
        ]}
      >
        {highlight && (
          <LinearGradient
            colors={['rgba(232,99,122,0.16)', 'rgba(232,99,122,0.04)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          style={[
            styles.methodIcon,
            {
              backgroundColor: highlight ? 'rgba(232,99,122,0.20)' : theme.colors.surfaceAlt,
            },
          ]}
        >
          <Feather name={icon} size={22} color={highlight ? theme.colors.primary : theme.colors.foreground} />
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text variant="bodyMedium" weight="semibold">
            {title}
          </Text>
          <Text variant="bodySmall" color="muted" style={{ marginTop: 2 }}>
            {body}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 16 },
  hero: { alignItems: 'center', marginTop: 32 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 84,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderWrap: { width: '100%', aspectRatio: 0.78, marginTop: 24, position: 'relative' },
  viewfinderRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  viewfinder: { flex: 1, borderRadius: 24, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
