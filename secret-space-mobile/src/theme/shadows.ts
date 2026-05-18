import { Platform, ViewStyle } from 'react-native';

const shadow = (
  color: string,
  offsetY: number,
  radius: number,
  opacity: number,
  elevation: number
): ViewStyle =>
  Platform.select({
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: offsetY },
      shadowRadius: radius,
      shadowOpacity: opacity,
    },
    android: { elevation },
    default: {},
  })!;

export const shadows = {
  card: shadow('#000000', 8, 24, 0.18, 4),
  // Light-mode card shadow: iOS keeps its subtle drop shadow (which respects
  // borderRadius and reads as gentle depth on cream backgrounds), but Android
  // elevation is dropped to 0. Android's elevation renders a *rectangular*
  // box-shadow that does not follow the card's rounded corners, which on a
  // light cream background looks like a muddy gray box sitting behind every
  // card. Border + tinted surface alone give enough visual definition on
  // light mode without the ugly rectangle artifact.
  cardLight: shadow('#000000', 6, 18, 0.08, 0),
  modal: shadow('#000000', 24, 48, 0.32, 12),
  glow: shadow('#E8637A', 12, 32, 0.40, 8),
  glowSoft: shadow('#E8637A', 8, 22, 0.22, 6),
  goldGlow: shadow('#C9A96E', 10, 28, 0.30, 6),
} as const;
