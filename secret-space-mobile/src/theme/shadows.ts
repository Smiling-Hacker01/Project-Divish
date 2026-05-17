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
  cardLight: shadow('#000000', 6, 18, 0.08, 3),
  modal: shadow('#000000', 24, 48, 0.32, 12),
  glow: shadow('#E8637A', 12, 32, 0.40, 8),
  glowSoft: shadow('#E8637A', 8, 22, 0.22, 6),
  goldGlow: shadow('#C9A96E', 10, 28, 0.30, 6),
} as const;
