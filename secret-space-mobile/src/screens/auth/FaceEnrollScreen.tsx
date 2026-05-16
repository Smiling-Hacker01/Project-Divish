import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, TopBar, Text, Button, ProgressBar } from '@/components';
import { useTheme } from '@/theme';
import { AuthStackParamList } from '@/navigation/types';
import { authApi } from '@/api';

type Props = NativeStackScreenProps<AuthStackParamList, 'FaceEnroll'>;

export function FaceEnrollScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, [spin]);

  const labels = ['Center', 'Left', 'Right'] as const;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const capture = async () => {
    if (!cameraRef.current || submitting) return;
    setSubmitting(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
      if (step < 2) {
        setStep((s) => ((s + 1) as 0 | 1 | 2));
      } else if (route.params?.email && route.params?.password && photo?.base64) {
        await authApi.enrollFace({
          email: route.params.email,
          password: route.params.password,
          faceImage: photo.base64,
        });
        setSuccess(true);
        setTimeout(() => navigation.replace('CoupleCode'), 1200);
      } else {
        setSuccess(true);
        setTimeout(() => navigation.replace('CoupleCode'), 1000);
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer glowCorner="top-right">
      <TopBar title="Set up Face ID" centerElement={<ProgressBar total={4} current={3} />} />
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
          {success ? 'Got it.' : `Look ${labels[step].toLowerCase()}`}
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
            label="Skip biometrics for now"
            variant="ghost"
            onPress={() => navigation.replace('CoupleCode')}
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
