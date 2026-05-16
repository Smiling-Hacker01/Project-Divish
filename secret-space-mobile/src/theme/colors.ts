export const palette = {
  rose: '#E8637A',
  gold: '#C9A96E',
  sage: '#7EAFA0',
  nearBlack: '#0D0D0F',
  surfaceDark: '#161618',
  surfaceDarkAlt: '#1F1A1B',
  warmWhite: '#E5E1E4',
  cream: '#F7F4F2',
  surfaceLight: '#FFFFFF',
  surfaceLightAlt: '#F0EAE7',
  muted: '#A58A8C',
  destructive: '#E8637A',
} as const;

export type ColorScheme = 'dark' | 'light';

export interface ThemeColors {
  background: string;
  backgroundElevated: string;
  surface: string;
  surfaceAlt: string;
  surfaceTinted: string;
  glass: string;
  glassStrong: string;
  hairline: string;
  hairlineStrong: string;
  foreground: string;
  foregroundDim: string;
  muted: string;
  primary: string;
  primarySoft: string;
  accent: string;
  success: string;
  destructive: string;
  ringSoft: string;
}

export const darkColors: ThemeColors = {
  background: palette.nearBlack,
  backgroundElevated: '#08080A',
  surface: palette.surfaceDark,
  surfaceAlt: palette.surfaceDarkAlt,
  surfaceTinted: 'rgba(232,99,122,0.06)',
  glass: 'rgba(255,255,255,0.06)',
  glassStrong: 'rgba(255,255,255,0.10)',
  hairline: 'rgba(255,255,255,0.08)',
  hairlineStrong: 'rgba(255,255,255,0.16)',
  foreground: palette.warmWhite,
  foregroundDim: 'rgba(229,225,228,0.80)',
  muted: palette.muted,
  primary: palette.rose,
  primarySoft: 'rgba(232,99,122,0.18)',
  accent: palette.gold,
  success: palette.sage,
  destructive: palette.rose,
  ringSoft: 'rgba(232,99,122,0.30)',
};

export const lightColors: ThemeColors = {
  background: palette.cream,
  backgroundElevated: '#FFFFFF',
  surface: palette.surfaceLight,
  surfaceAlt: palette.surfaceLightAlt,
  surfaceTinted: 'rgba(232,99,122,0.05)',
  glass: 'rgba(255,255,255,0.55)',
  glassStrong: 'rgba(255,255,255,0.78)',
  hairline: 'rgba(0,0,0,0.08)',
  hairlineStrong: 'rgba(0,0,0,0.14)',
  foreground: '#19171B',
  foregroundDim: 'rgba(25,23,27,0.78)',
  muted: '#7E6E70',
  primary: palette.rose,
  primarySoft: 'rgba(232,99,122,0.14)',
  accent: palette.gold,
  success: palette.sage,
  destructive: palette.rose,
  ringSoft: 'rgba(232,99,122,0.22)',
};

export const gradientStops = ['#E8637A', '#C9A96E'] as const;
