import React from 'react';
import { Platform, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/theme';

interface Props extends ViewProps {
  intensity?: number;
  radius?: number;
  borderless?: boolean;
}

/**
 * Frosted-glass surface used by the floating bottom tab bar and lightbox toolbar.
 *
 * Platform reality: `expo-blur` only delivers real GPU blur on iOS and on Android 12+
 * with the *new* BlurView fallback path. On older Android (and in practice on most
 * Samsung skins with newArchEnabled), BlurView renders as a flat colored rectangle —
 * with our previous 0.4 alpha overlay, that meant scrolling content bled through the
 * tab bar. The fix: bump the Android overlay close to opaque so the bar reads as a
 * solid surface regardless of whether real blur is available.
 */
export function GlassSurface({ intensity, radius, borderless, style, children, ...rest }: Props) {
  const theme = useTheme();
  const blurIntensity = intensity ?? (theme.scheme === 'dark' ? 32 : 50);
  const tint = theme.scheme === 'dark' ? 'dark' : 'light';
  const r = radius ?? 16;

  // On Android we treat the surface as effectively opaque (0.92 alpha) so the bottom
  // tab bar reads as a solid floating chip over scrolling content. On iOS the real
  // blur does the work and we keep the original translucent feel.
  const isAndroid = Platform.OS === 'android';
  const overlay = theme.scheme === 'dark'
    ? isAndroid ? 'rgba(13,13,15,0.92)' : 'rgba(13,13,15,0.4)'
    : isAndroid ? 'rgba(248,247,245,0.95)' : 'rgba(255,255,255,0.5)';

  return (
    <View
      style={[
        styles.wrap,
        {
          borderRadius: r,
          borderColor: borderless ? 'transparent' : theme.colors.hairline,
          // The shadow lifts the bar off the page on Android (no blur to suggest depth).
          // iOS gets shadow too — it complements the blur, doesn't compete.
          ...Platform.select({
            android: { elevation: 8 },
            ios: {
              shadowColor: '#000',
              shadowOpacity: theme.scheme === 'dark' ? 0.4 : 0.15,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
            },
          }),
        },
        style as ViewStyle,
      ]}
      {...rest}
    >
      <BlurView intensity={blurIntensity} tint={tint} style={[StyleSheet.absoluteFill, { borderRadius: r }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: overlay }]} />
      </BlurView>
      <View style={{ overflow: 'hidden', borderRadius: r }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
