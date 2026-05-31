import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, StyleSheet, View, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * Global toast presenter. Designed for quiet success/info confirmations
 * ("Saved to your gallery", "Copied", "Sent") that don't warrant a modal
 * Alert. Stays scoped to a 2.5s fade-in/fade-out near the bottom of the
 * screen and stacks above the floating tab bar without obstructing it.
 *
 * Architecture: a module-level event emitter so any screen can call
 * `toast.show(...)` without threading a context provider through the
 * navigation stack. A single <ToastHost /> mounted near the app root
 * subscribes and renders. This is cheaper than React Context for a feature
 * we only invoke a handful of times per session.
 *
 * Voice: short, conversational, no exclamation points. Match the copy
 * patterns from src/copy/index.ts.
 */

export type ToastVariant = 'success' | 'info' | 'error';

interface ShowOptions {
  message: string;
  variant?: ToastVariant;
  /** ms before auto-dismiss. Default 2500. */
  durationMs?: number;
}

type Listener = (opts: ShowOptions) => void;

const listeners = new Set<Listener>();

export const toast = {
  show(opts: ShowOptions): void {
    listeners.forEach((l) => l(opts));
  },
  success(message: string, durationMs?: number): void {
    this.show({ message, variant: 'success', durationMs });
  },
  info(message: string, durationMs?: number): void {
    this.show({ message, variant: 'info', durationMs });
  },
  error(message: string, durationMs?: number): void {
    this.show({ message, variant: 'error', durationMs });
  },
};

export function ToastHost(): React.ReactElement | null {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [opts, setOpts] = useState<ShowOptions | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 20, duration: 220, useNativeDriver: true }),
    ]).start(() => setOpts(null));
  }, [opacity, translateY]);

  useEffect(() => {
    const listener: Listener = (next) => {
      // If a toast is currently showing, replace it. Cancel the existing
      // dismiss timer to avoid two competing fade-outs.
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
      setOpts(next);
      opacity.setValue(0);
      translateY.setValue(20);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
      dismissTimer.current = setTimeout(dismiss, next.durationMs ?? 2500);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [dismiss, opacity, translateY]);

  if (!opts) return null;

  const variant = opts.variant ?? 'success';
  const iconName: keyof typeof Feather.glyphMap =
    variant === 'success' ? 'check-circle' : variant === 'error' ? 'alert-circle' : 'info';
  const accentColor =
    variant === 'success'
      ? theme.colors.primary
      : variant === 'error'
        ? theme.colors.destructive
        : theme.colors.foreground;

  // Bottom inset: floating tab bar is roughly 80dp above the safe-area edge,
  // so we lift the toast by tabBar + a comfortable gap. Falls back to a
  // sensible minimum on screens without a tab bar.
  const bottom = Math.max(insets.bottom, 8) + (theme.bottomNavReserve ?? 80) + 12;

  return (
    <View pointerEvents="box-none" style={[styles.container, { bottom }]}>
      <Animated.View
        style={[
          styles.toast,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.hairline,
            opacity,
            transform: [{ translateY }],
            ...Platform.select({
              ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12 },
              android: { elevation: 8 },
            }),
          },
        ]}
      >
        <Feather name={iconName} size={16} color={accentColor} />
        <Text variant="bodySmall" style={{ flex: 1, marginLeft: 10, color: theme.colors.foreground }}>
          {opts.message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 160,
    maxWidth: 360,
  },
});
