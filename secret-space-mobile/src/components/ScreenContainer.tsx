import React from 'react';
import { Platform, ScrollView, StatusBar, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  glowCorner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
  glowColor?: 'rose-gold' | 'gold';
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

/**
 * Screen-level container with deterministic safe-area handling.
 *
 * Why deterministic (not SafeAreaView): the frame-aware deduplication logic in
 * react-native-safe-area-context is unreliable on the very first render — both
 * a parent SafeAreaView (here) and a child SafeAreaView (in a header component
 * one level down) can simultaneously return 0 OR both apply the inset, depending
 * on micro-timing of the native measurement callback. The result is the
 * status-bar-overlap-on-first-reload bug we kept chasing.
 *
 * Replacing the parent SafeAreaView with a plain View + computed paddingTop /
 * paddingBottom from `useSafeAreaInsets` makes the top inset synchronous and
 * single-sourced. `Math.max` with `StatusBar.currentHeight` (Android) / a 44pt
 * iOS fallback guarantees we never paint under the status bar even if the
 * inset reports zero before the first native measurement arrives.
 *
 * Headers (TopBar, InlineHeader) now render as plain children — no nested
 * SafeAreaView, no frame-aware behavior to misfire.
 */
export function ScreenContainer({
  children,
  scroll = false,
  contentStyle,
  glowCorner = 'top-left',
  glowColor = 'rose-gold',
  edges = ['top', 'bottom'],
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // Synchronous fallback so the first paint never overlaps the status bar even
  // when useSafeAreaInsets has not yet received the native measurement. Android
  // exposes the live status bar height via StatusBar.currentHeight; iOS has no
  // equivalent so we use a 44pt floor that covers notch + clock on every model
  // from iPhone X onwards.
  const androidStatusBar = StatusBar.currentHeight ?? 24;
  const iosTopFallback = 44;
  const topInset = edges.includes('top')
    ? Math.max(insets.top, Platform.OS === 'android' ? androidStatusBar : iosTopFallback)
    : 0;
  const bottomInset = edges.includes('bottom') ? insets.bottom : 0;

  const Inner = scroll ? ScrollView : View;
  const innerProps = scroll
    ? {
        contentContainerStyle: [{ flexGrow: 1, paddingBottom: theme.spacing.xxl }, contentStyle],
        showsVerticalScrollIndicator: false,
      }
    : { style: [{ flex: 1 }, contentStyle] };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.background,
          paddingTop: topInset,
          paddingBottom: bottomInset,
        },
      ]}
    >
      {glowCorner !== 'none' && <CornerGlow corner={glowCorner} color={glowColor} scheme={theme.scheme} />}
      <Inner {...(innerProps as any)}>{children}</Inner>
    </View>
  );
}

function CornerGlow({
  corner,
  color,
  scheme,
}: {
  corner: NonNullable<Props['glowCorner']>;
  color: 'rose-gold' | 'gold';
  scheme: 'dark' | 'light';
}) {
  const positionStyle: ViewStyle = {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
  };
  if (corner === 'top-left') Object.assign(positionStyle, { top: -180, left: -180 });
  if (corner === 'top-right') Object.assign(positionStyle, { top: -180, right: -180 });
  if (corner === 'bottom-left') Object.assign(positionStyle, { bottom: -180, left: -180 });
  if (corner === 'bottom-right') Object.assign(positionStyle, { bottom: -180, right: -180 });

  const gradient =
    color === 'gold'
      ? (['rgba(201,169,110,0.30)', 'rgba(201,169,110,0)'] as const)
      : (['rgba(232,99,122,0.30)', 'rgba(201,169,110,0.18)', 'rgba(232,99,122,0)'] as const);

  return (
    // Wrap LinearGradient in a View whose pointerEvents="none" is guaranteed to be
    // honored by React Native. expo-linear-gradient occasionally fails to forward
    // its own `pointerEvents` prop on Android, causing the glow to silently absorb
    // taps near the top-left corner — exactly where the back chevron lives, which
    // is why hitting "back" on Chat was a no-op for some users.
    <View pointerEvents="none" style={positionStyle}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0.2, y: 0.2 }}
        end={{ x: 0.8, y: 0.8 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 200 }, scheme === 'light' && { opacity: 0.55 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
