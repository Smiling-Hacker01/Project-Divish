import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer, InlineHeader, Text, Button } from '@/components';
import { useTheme } from '@/theme';
import { settingsApi } from '@/api';
import { useAuth } from '@/context/AuthContext';

/**
 * Re-enroll the user's face descriptor while they're already signed in.
 *
 * Distinct from `auth/FaceEnrollScreen.tsx` because:
 *   - That one is part of the auth flow, receives email+password as params, and
 *     posts to /api/auth/enroll-face which verifies them.
 *   - This one uses the JWT (already authenticated) and posts to the dedicated
 *     /api/settings/face-descriptor endpoint.
 *   - That one redirects to CoupleCode on success; this one pops back to Settings.
 *
 * Capture pattern matches the auth screen so the user gets a consistent experience.
 * Three guidance frames (center / left / right) build trust that the descriptor is
 * a good match across angles; only the third capture is submitted (the descriptor
 * model only needs one frontal face — the other two are pure UX).
 */
export function FaceReenrollScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { refreshProfile } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [spin]);

  const labels = ['Center', 'Left', 'Right'] as const;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const capture = async () => {
    if (!cameraRef.current || submitting || success) return;
    setSubmitting(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
      if (step < 2) {
        // First two captures are just guidance frames — advance state, don't submit.
        setStep((s) => ((s + 1) as 0 | 1 | 2));
        return;
      }
      if (!photo?.base64) {
        setError('Could not capture the image. Try again.');
        return;
      }
      await settingsApi.enrollFace(photo.base64);
      // Refresh profile so faceMFAEnabled flips to true everywhere it's rendered
      // (Settings row chip, getProfile-driven flags).
      await refreshProfile().catch(() => undefined);
      setSuccess(true);
      setTimeout(() => {
        if (navigation.canGoBack()) navigation.goBack();
      }, 1200);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? 'Could not enroll your face.';
      setError(msg);
      // Step back so the user can retry from the same angle.
      if (step === 2) setStep(2);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer glowCorner="top-right">
      <InlineHeader title="Re-enroll Face ID" showBack />
      <View style={[styles.wrap, { paddingHorizontal: theme.screenPadding }]}>
        <View style={styles.frameWrap}>
          <Animated.View
            style={[
              styles.ring,
              success ? { borderColor: theme.colors.success } : null,
              !success && { transform: [{ rotate }] },
            ]}
          >
            {!success && (
              <LinearGradient
                colors={['rgba(232,99,122,0)', '#E8637A', '#C9A96E', 'rgba(201,169,110,0)']}
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
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text variant="bodySmall" color="muted">
                  Camera permission needed.
                </Text>
              </View>
            )}
            <View style={styles.faceGuide} />
            {success && (
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <Feather name="check-circle" size={56} color={theme.colors.success} />
              </View>
            )}
          </View>
        </View>

        <Text variant="h3" align="center" style={{ marginTop: 32 }}>
          {success ? 'Face updated.' : `Look ${labels[step].toLowerCase()}`}
        </Text>

        <View style={styles.dots}>
          {labels.map((l, i) => (
            <View
              key={l}
              style={[
                styles.dot,
                {
                  backgroundColor: i <= step ? theme.colors.primary : theme.colors.hairlineStrong,
                },
              ]}
            />
          ))}
        </View>

        {error && (
          <Text variant="bodySmall" color="destructive" align="center" style={{ marginTop: 16 }}>
            {error}
          </Text>
        )}

        <View style={styles.captureWrap}>
          <Pressable onPress={capture} disabled={submitting || success}>
            <LinearGradient
              colors={theme.gradientStops as unknown as readonly [string, string]}
              style={styles.captureRing}
            >
              <View style={[styles.captureCore, { backgroundColor: theme.colors.foreground }]} />
            </LinearGradient>
          </Pressable>
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => navigation.canGoBack() && navigation.goBack()}
            style={{ marginTop: 12 }}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 16 },
  frameWrap: { width: '100%', aspectRatio: 0.78, position: 'relative' },
  ring: {
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
  faceGuide: {
    position: 'absolute',
    left: '20%',
    right: '20%',
    top: '20%',
    bottom: '20%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  captureWrap: { marginTop: 'auto', alignItems: 'center', paddingBottom: 24 },
  captureRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  captureCore: { width: 56, height: 56, borderRadius: 28 },
});
