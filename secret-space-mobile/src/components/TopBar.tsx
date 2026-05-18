import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '@/theme';
import { Text } from './Text';

interface Action {
  icon: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  // `true` shows a dot (unspecified count); a number shows that count, capped at 99+.
  badge?: boolean | number;
}

interface Props {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightActions?: Action[];
  leadingElement?: React.ReactNode;
  centerElement?: React.ReactNode;
  style?: ViewStyle;
  // Default true: solid background + bottom hairline + status-bar inset, so scrolled
  // content underneath doesn't bleed through. Set to false when the bar is over a
  // hero image and you want it transparent.
  opaque?: boolean;
  // `solid` (default): chunky icons, hairline divider, opaque background — used on Chat
  //   and navigation-context screens (Settings, Auth, modals) where the bar anchors
  //   the page and pins partner info during scroll.
  // `floating`: transparent background, no hairline, slimmer icons — used on tab
  //   landing screens (Home, Vault, LoveBot) where the bar should feel weightless
  //   and let the corner-glow gradient bleed through.
  variant?: 'solid' | 'floating';
}

export function TopBar({
  title,
  showBack = true,
  onBack,
  rightActions = [],
  leadingElement,
  centerElement,
  style,
  opaque = true,
  variant = 'solid',
}: Props) {
  const theme = useTheme();
  const navigation = useNavigation();
  const handleBack = () => {
    if (onBack) return onBack();
    if (navigation.canGoBack()) navigation.goBack();
  };

  const isFloating = variant === 'floating';
  // Background + hairline rules.
  //   - `floating` always wins: transparent + no hairline so the corner-glow gradient
  //     reads through and the bar feels weightless.
  //   - `solid` + opaque (default): background fill + hairline so scrolled content
  //     doesn't bleed up.
  //   - `solid` + opaque=false: transparent over a hero image (legacy About-screen use).
  const bgColor = isFloating || !opaque ? 'transparent' : theme.colors.background;
  const showHairline = !isFloating && opaque;

  // Icon button dimensions: 36×36 floating, 40×40 solid. The smaller chip on floating
  // bars reads lighter against the gradient backdrop without losing tap-target size
  // (still >=44pt with hitSlop).
  const iconBtnSize = isFloating ? 36 : 40;
  const iconBtnRadius = iconBtnSize / 2;
  // On floating we drop the border outline — the glass fill alone gives enough
  // separation against the gradient. On solid we keep the border for crispness.
  const iconBorderWidth = isFloating ? 0 : 1;

  return (
    // No SafeAreaView wrap — ScreenContainer now applies the top inset
    // deterministically (useSafeAreaInsets + StatusBar.currentHeight fallback)
    // so we'd only fight it. The bgColor + hairline live on the bar's own row.
    <View
      style={{
        backgroundColor: bgColor,
        borderBottomWidth: showHairline ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: theme.colors.hairline,
      }}
    >
      <View style={[styles.bar, { paddingHorizontal: theme.spacing.lg }, style]}>
        <View style={styles.side}>
          {leadingElement}
          {!leadingElement && showBack && (
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [
                styles.iconBtn,
                {
                  width: iconBtnSize,
                  height: iconBtnSize,
                  borderRadius: iconBtnRadius,
                  borderWidth: iconBorderWidth,
                  backgroundColor: theme.colors.glass,
                  borderColor: theme.colors.hairlineStrong,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              hitSlop={8}
            >
              <Feather name="chevron-left" size={isFloating ? 20 : 22} color={theme.colors.foreground} />
            </Pressable>
          )}
        </View>

        <View style={styles.center}>
          {centerElement ??
            (title ? (
              <Text variant="h3" style={{ fontSize: 18 }} numberOfLines={1}>
                {title}
              </Text>
            ) : null)}
        </View>

        <View style={[styles.side, { justifyContent: 'flex-end' }]}>
          {rightActions.map((a, i) => {
            const numericBadge = typeof a.badge === 'number' ? a.badge : null;
            const showDot = a.badge === true;
            return (
              <Pressable
                key={i}
                onPress={a.onPress}
                style={({ pressed }) => [
                  styles.iconBtn,
                  {
                    width: iconBtnSize,
                    height: iconBtnSize,
                    borderRadius: iconBtnRadius,
                    borderWidth: iconBorderWidth,
                    backgroundColor: theme.colors.glass,
                    borderColor: theme.colors.hairlineStrong,
                    marginLeft: i ? 8 : 0,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                hitSlop={8}
              >
                <Feather name={a.icon} size={isFloating ? 18 : 20} color={theme.colors.foreground} />
                {showDot && (
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: theme.colors.primary,
                        borderColor: theme.colors.background,
                      },
                    ]}
                  />
                )}
                {numericBadge !== null && numericBadge > 0 && (
                  <View
                    style={[
                      styles.count,
                      {
                        backgroundColor: theme.colors.primary,
                        borderColor: theme.colors.background,
                      },
                    ]}
                  >
                    <Text
                      variant="caption"
                      style={{ color: '#fff', fontSize: 10, fontWeight: '700', lineHeight: 12 }}
                    >
                      {numericBadge > 99 ? '99+' : numericBadge}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 56, flexDirection: 'row', alignItems: 'center' },
  // Sides size to their content; center takes the remaining space. Previously we had
  // `flex: 1` on each side and `flex: 2` on center (1:2:1) which mathematically gives
  // each side a fixed 25% of the bar — too tight when the right side has two action
  // buttons (40px each + 8 margin = 88px, but only ~80px allotted on a 360dp screen).
  side: { flexDirection: 'row', alignItems: 'center', minWidth: 40 },
  center: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  // Width / height / borderRadius / borderWidth are applied dynamically per-variant
  // by the component itself — we only set the layout properties shared across both.
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
  },
  count: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
