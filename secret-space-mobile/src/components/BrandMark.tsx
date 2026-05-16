import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';

interface Props {
  size?: number;
  animated?: boolean;
}

export function BrandMark({ size = 96, animated = true }: Props) {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.04,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scale, animated]);

  const ring = size * 0.5;
  return (
    <Animated.View style={[styles.wrap, { width: size, height: size, transform: [{ scale }] }]}>
      <View style={[styles.ring, { width: ring, height: ring, borderRadius: ring / 2, borderColor: theme.colors.primary, left: size * 0.05, top: size * 0.2 }]} />
      <View style={[styles.ring, { width: ring, height: ring, borderRadius: ring / 2, borderColor: theme.colors.accent, right: size * 0.05, top: size * 0.2 }]} />
      <LinearGradient
        colors={theme.gradientStops as unknown as readonly [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          position: 'absolute',
          width: size * 0.18,
          height: size * 0.5,
          left: size * 0.41,
          top: size * 0.2,
          opacity: 0.6,
          borderRadius: size * 0.09,
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 3 },
});
