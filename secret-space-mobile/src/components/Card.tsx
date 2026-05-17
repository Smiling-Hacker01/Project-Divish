import React from 'react';
import { Pressable, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';

interface Props extends ViewProps {
  variant?: 'solid' | 'tinted-rose' | 'tinted-gold' | 'glass';
  padding?: number;
  radius?: number;
  gradientBorder?: boolean;
  onPress?: () => void;
}

export function Card({
  variant = 'solid',
  padding,
  radius,
  gradientBorder,
  onPress,
  style,
  children,
  ...rest
}: Props) {
  const theme = useTheme();
  const r = radius ?? theme.radii.lg;
  const p = padding ?? theme.spacing.lg;

  const bg =
    variant === 'glass'
      ? theme.colors.glass
      : variant === 'tinted-rose'
        ? theme.colors.surfaceTinted
        : variant === 'tinted-gold'
          ? 'rgba(201,169,110,0.08)'
          : theme.colors.surface;

  const containerStyle: ViewStyle = {
    backgroundColor: bg,
    borderRadius: r,
    padding: p,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    ...(theme.scheme === 'dark' ? theme.shadows.card : theme.shadows.cardLight),
  };

  const content = <View style={[containerStyle, style]} {...rest}>{children}</View>;

  if (gradientBorder) {
    return (
      <View style={[styles.gradientWrap, { borderRadius: r + 1 }]}>
        <LinearGradient
          colors={theme.gradientStops as unknown as readonly [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: r + 1 }]}
        />
        <View
          style={{
            backgroundColor: bg,
            margin: 1,
            borderRadius: r,
            padding: p,
          }}
          {...rest}
        >
          {children}
        </View>
      </View>
    );
  }

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  gradientWrap: { overflow: 'hidden' },
});
