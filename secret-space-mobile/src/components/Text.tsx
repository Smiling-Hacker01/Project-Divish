import React from 'react';
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';
import { useTheme } from '@/theme';
import { TypographyKey } from '@/theme/typography';

interface Props extends RNTextProps {
  variant?: TypographyKey;
  color?: 'foreground' | 'foregroundDim' | 'muted' | 'primary' | 'accent' | 'success' | 'destructive' | 'inverse';
  align?: 'left' | 'center' | 'right';
  weight?: 'regular' | 'medium' | 'semibold';
  italic?: boolean;
}

export function Text({ variant = 'body', color = 'foreground', align, weight, italic, style, ...rest }: Props) {
  const theme = useTheme();
  const colorMap: Record<NonNullable<Props['color']>, string> = {
    foreground: theme.colors.foreground,
    foregroundDim: theme.colors.foregroundDim,
    muted: theme.colors.muted,
    primary: theme.colors.primary,
    accent: theme.colors.accent,
    success: theme.colors.success,
    destructive: theme.colors.destructive,
    inverse: '#FFFFFF',
  };
  const computed: TextStyle = {
    ...theme.typography[variant],
    color: colorMap[color],
  };
  if (align) computed.textAlign = align;
  if (weight === 'medium') computed.fontFamily = theme.typography.bodyMedium.fontFamily;
  if (weight === 'semibold') computed.fontFamily = theme.typography.button.fontFamily;
  if (italic) computed.fontStyle = 'italic';
  return <RNText {...rest} style={[computed, style]} />;
}
