import React from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  glowCorner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
  glowColor?: 'rose-gold' | 'gold';
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

export function ScreenContainer({
  children,
  scroll = false,
  contentStyle,
  glowCorner = 'top-left',
  glowColor = 'rose-gold',
  edges = ['top', 'bottom'],
}: Props) {
  const theme = useTheme();
  const Inner = scroll ? ScrollView : View;
  const innerProps = scroll
    ? {
        contentContainerStyle: [{ flexGrow: 1, paddingBottom: theme.spacing.xxl }, contentStyle],
        showsVerticalScrollIndicator: false,
      }
    : { style: [{ flex: 1 }, contentStyle] };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={edges}>
      {glowCorner !== 'none' && <CornerGlow corner={glowCorner} color={glowColor} scheme={theme.scheme} />}
      <Inner {...(innerProps as any)}>{children}</Inner>
    </SafeAreaView>
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
    <LinearGradient
      pointerEvents="none"
      colors={gradient}
      start={{ x: 0.2, y: 0.2 }}
      end={{ x: 0.8, y: 0.8 }}
      style={[positionStyle, scheme === 'light' && { opacity: 0.55 }]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
