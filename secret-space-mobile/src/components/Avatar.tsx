import React, { useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { useTheme } from '@/theme';
import { Text } from './Text';

/**
 * Single source of truth for user identity rendering across the app. Behavior contract:
 *
 *   - `uri` set + image loads → show the image
 *   - `uri` set + image fails (404, network error) → silently fall back to initials
 *   - `uri` null/undefined → show initials immediately
 *   - `name` missing → show "?"
 *
 * Uses expo-image so all avatars share a single memory+disk cache. Different Cloudinary
 * URLs per upload mean cache invalidation is automatic — we never serve a stale image.
 */

interface Props {
  uri?: string | null;
  name?: string;
  size?: number;
  ring?: 'rose' | 'gold' | 'gradient' | 'sage' | 'none';
  style?: ViewStyle;
}

export function Avatar({ uri, name, size = 48, ring = 'none', style }: Props) {
  const theme = useTheme();
  const [imgFailed, setImgFailed] = useState(false);

  // Reset the failed flag whenever the URI itself changes — a fresh URL deserves a
  // fresh attempt even if the previous one 404'd.
  React.useEffect(() => {
    setImgFailed(false);
  }, [uri]);

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

  // Initials-sized typography. Below 32 we drop one size step so the letters fit.
  const fontSize = size < 36 ? 11 : size < 56 ? 14 : 18;

  // Show the image only if we have a URI AND it hasn't failed to load.
  const showImage = !!uri && !imgFailed;

  const innerNode = showImage ? (
    <ExpoImage
      source={{ uri: uri! }}
      style={{ width: inner, height: inner, borderRadius: innerRadius }}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      onError={() => setImgFailed(true)}
    />
  ) : (
    <LinearGradient
      colors={['rgba(232,99,122,0.4)', 'rgba(201,169,110,0.4)']}
      style={[styles.fallback, { width: inner, height: inner, borderRadius: innerRadius }]}
    >
      <Text
        weight="semibold"
        style={{ color: theme.colors.foreground, fontSize, lineHeight: fontSize + 2 }}
      >
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
