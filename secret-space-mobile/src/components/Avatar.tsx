import React from 'react';
import { Image, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { Text } from './Text';

interface Props {
  uri?: string | null;
  name?: string;
  size?: number;
  ring?: 'rose' | 'gold' | 'gradient' | 'sage' | 'none';
  style?: ViewStyle;
}

export function Avatar({ uri, name, size = 48, ring = 'none', style }: Props) {
  const theme = useTheme();
  const initials = (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();

  const ringWidth = ring === 'none' ? 0 : 2;
  const inner = size - ringWidth * 2 - 2;
  const innerRadius = inner / 2;

  const innerNode = uri ? (
    <Image source={{ uri }} style={{ width: inner, height: inner, borderRadius: innerRadius }} />
  ) : (
    <LinearGradient
      colors={['rgba(232,99,122,0.4)', 'rgba(201,169,110,0.4)']}
      style={[styles.fallback, { width: inner, height: inner, borderRadius: innerRadius }]}
    >
      <Text variant="bodyMedium" weight="semibold" style={{ color: theme.colors.foreground }}>
        {initials}
      </Text>
    </LinearGradient>
  );

  if (ring === 'none') {
    return <View style={[{ width: size, height: size }, style]}>{innerNode}</View>;
  }

  if (ring === 'gradient') {
    return (
      <View style={[{ width: size, height: size, borderRadius: size / 2 }, style]}>
        <LinearGradient
          colors={theme.gradientStops as unknown as readonly [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.ringWrap, { width: size, height: size, borderRadius: size / 2 }]}
        >
          <View
            style={{
              width: inner + 2,
              height: inner + 2,
              borderRadius: (inner + 2) / 2,
              backgroundColor: theme.colors.background,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {innerNode}
          </View>
        </LinearGradient>
      </View>
    );
  }

  const ringColor =
    ring === 'rose' ? theme.colors.primary : ring === 'gold' ? theme.colors.accent : theme.colors.success;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringWidth,
          borderColor: ringColor,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {innerNode}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
});
