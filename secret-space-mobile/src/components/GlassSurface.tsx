import React from 'react';
import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/theme';

interface Props extends ViewProps {
  intensity?: number;
  radius?: number;
  borderless?: boolean;
}

export function GlassSurface({ intensity, radius, borderless, style, children, ...rest }: Props) {
  const theme = useTheme();
  const blurIntensity = intensity ?? (theme.scheme === 'dark' ? 32 : 50);
  const tint = theme.scheme === 'dark' ? 'dark' : 'light';

  return (
    <View
      style={[
        styles.wrap,
        { borderRadius: radius ?? 16, borderColor: borderless ? 'transparent' : theme.colors.hairline },
        style as ViewStyle,
      ]}
      {...rest}
    >
      <BlurView intensity={blurIntensity} tint={tint} style={[StyleSheet.absoluteFill, { borderRadius: radius ?? 16 }]}>
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.scheme === 'dark' ? 'rgba(13,13,15,0.4)' : 'rgba(255,255,255,0.5)' },
          ]}
        />
      </BlurView>
      <View style={{ overflow: 'hidden', borderRadius: radius ?? 16 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
