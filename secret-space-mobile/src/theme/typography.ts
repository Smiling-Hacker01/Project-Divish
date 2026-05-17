import { TextStyle } from 'react-native';

export const fontFamily = {
  serif: 'Fraunces_400Regular',
  serifMedium: 'Fraunces_500Medium',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
} as const;

export const typography = {
  display: { fontFamily: fontFamily.serif, fontSize: 36, lineHeight: 44, letterSpacing: -0.5 } satisfies TextStyle,
  h1: { fontFamily: fontFamily.serif, fontSize: 32, lineHeight: 40, letterSpacing: -0.4 } satisfies TextStyle,
  h2: { fontFamily: fontFamily.serif, fontSize: 28, lineHeight: 36, letterSpacing: -0.3 } satisfies TextStyle,
  h3: { fontFamily: fontFamily.serif, fontSize: 22, lineHeight: 30, letterSpacing: -0.2 } satisfies TextStyle,
  serifBody: { fontFamily: fontFamily.serif, fontSize: 18, lineHeight: 28 } satisfies TextStyle,
  serifQuote: { fontFamily: fontFamily.serif, fontSize: 22, lineHeight: 32, fontStyle: 'italic' } satisfies TextStyle,
  body: { fontFamily: fontFamily.sans, fontSize: 16, lineHeight: 24 } satisfies TextStyle,
  bodyMedium: { fontFamily: fontFamily.sansMedium, fontSize: 16, lineHeight: 24 } satisfies TextStyle,
  bodySmall: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20 } satisfies TextStyle,
  label: { fontFamily: fontFamily.sansMedium, fontSize: 14, lineHeight: 20 } satisfies TextStyle,
  caption: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 } satisfies TextStyle,
  overline: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  } satisfies TextStyle,
  button: { fontFamily: fontFamily.sansSemiBold, fontSize: 16, lineHeight: 20, letterSpacing: 0.1 } satisfies TextStyle,
  numeralLarge: { fontFamily: fontFamily.serifMedium, fontSize: 56, lineHeight: 60, letterSpacing: -1 } satisfies TextStyle,
  numeralMedium: { fontFamily: fontFamily.serifMedium, fontSize: 36, lineHeight: 40 } satisfies TextStyle,
  mono: { fontFamily: fontFamily.mono, fontSize: 16, lineHeight: 22, letterSpacing: 1.2 } satisfies TextStyle,
  monoLarge: { fontFamily: fontFamily.mono, fontSize: 36, lineHeight: 44, letterSpacing: 4 } satisfies TextStyle,
} as const;

export type TypographyKey = keyof typeof typography;
