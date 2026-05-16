import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { Text } from './Text';

type Tone = 'rose' | 'gold' | 'sage' | 'muted' | 'glass' | 'gradient';

interface Props {
  label: string;
  tone?: Tone;
  size?: 'sm' | 'md';
  selected?: boolean;
  onPress?: () => void;
  leadingNode?: React.ReactNode;
  style?: ViewStyle;
}

export function Chip({ label, tone = 'glass', size = 'md', selected, onPress, leadingNode, style }: Props) {
  const theme = useTheme();
  const h = size === 'sm' ? 28 : 36;
  const px = size === 'sm' ? 10 : 14;

  if (tone === 'gradient' || selected) {
    return (
      <Pressable onPress={onPress} disabled={!onPress}>
        <LinearGradient
          colors={theme.gradientStops as unknown as readonly [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.base,
            { height: h, paddingHorizontal: px, borderRadius: 999 },
            style,
          ]}
        >
          {leadingNode}
          <Text variant="caption" style={{ color: '#fff', fontSize: size === 'sm' ? 11 : 12, marginLeft: leadingNode ? 6 : 0 }} weight="semibold">
            {label.toUpperCase()}
          </Text>
        </LinearGradient>
      </Pressable>
    );
  }

  const colorMap: Record<Tone, { bg: string; fg: string; border: string }> = {
    rose: { bg: 'rgba(232,99,122,0.16)', fg: theme.colors.primary, border: 'rgba(232,99,122,0.30)' },
    gold: { bg: 'rgba(201,169,110,0.16)', fg: theme.colors.accent, border: 'rgba(201,169,110,0.30)' },
    sage: { bg: 'rgba(126,175,160,0.16)', fg: theme.colors.success, border: 'rgba(126,175,160,0.30)' },
    muted: { bg: theme.colors.surface, fg: theme.colors.muted, border: theme.colors.hairline },
    glass: { bg: theme.colors.glass, fg: theme.colors.foreground, border: theme.colors.hairline },
    gradient: { bg: theme.colors.primary, fg: '#fff', border: 'transparent' },
  };
  const c = colorMap[tone];

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <View
        style={[
          styles.base,
          {
            height: h,
            paddingHorizontal: px,
            backgroundColor: c.bg,
            borderColor: c.border,
            borderRadius: 999,
            borderWidth: 1,
          },
          style,
        ]}
      >
        {leadingNode}
        <Text
          variant="caption"
          style={{ color: c.fg, fontSize: size === 'sm' ? 11 : 12, marginLeft: leadingNode ? 6 : 0 }}
          weight="semibold"
        >
          {label.toUpperCase()}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
