import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '@/theme';
import { Text } from './Text';

interface Action {
  icon: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  // `true` shows a dot (unspecified count); a number shows that count, capped at 99+.
  badge?: boolean | number;
  // `icon` (default) → glass chip matching the bar variant.
  // `cta` → 40×40 gradient circle for the primary creation action on landing
  // screens (e.g. the + on Diary / Coupons). Visually distinct from secondary
  // actions so the user's eye lands on the create affordance first.
  kind?: 'icon' | 'cta';
}

interface Props {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightActions?: Action[];
  leadingElement?: React.ReactNode;
  // Symmetric counterpart to `leadingElement` for when the right side needs
  // something richer than an icon Action (e.g. a labeled primary button in a
  // modal create / edit screen). When supplied, `rightActions` is ignored.
  trailingElement?: React.ReactNode;
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
  trailingElement,
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

  // Icon button dimensions: unified at 36×36 across both variants for a
  // consistent feel between the floating detail-page bar and the solid
  // modal/chat bar. The earlier 40×40 solid was visually heavier than the
  // 36×36 floating, which made detail screens like CouponDetail feel
  // stretched. Tap target stays comfortably above 44pt with hitSlop={8}.
  const iconBtnSize = 36;
  const iconBtnRadius = iconBtnSize / 2;
  // Border outline dropped on both variants — the glass fill alone gives
  // enough separation against any backdrop, and removing it visually unifies
  // icon chips with InlineHeader (which never had a border).
  const iconBorderWidth = 0;

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
              // Title sizing tightened 18→16pt — at the previous 18pt the
              // single-word titles ("Coupon", "New entry") felt oversized for
              // the page chrome and pulled the eye off the page content. 16pt
              // matches the bodyMedium scale and reads as utilitarian
              // navigation rather than dominant page metadata.
              <Text variant="bodyMedium" weight="semibold" numberOfLines={1}>
                {title}
              </Text>
            ) : null)}
        </View>

        <View style={[styles.side, { justifyContent: 'flex-end' }]}>
          {trailingElement ?? rightActions.map((a, i) => {
            const numericBadge = typeof a.badge === 'number' ? a.badge : null;
            const showDot = a.badge === true;
            const isCta = a.kind === 'cta';
            // The CTA variant renders the rose→gold gradient circle that
            // landing screens use for their primary creation action (the +
            // button on Diary / Coupons). Sized 40×40 so it reads as
            // deliberately heavier than the 36×36 secondary icon chips —
            // primary > secondary visual hierarchy.
            const btnSize = isCta ? 40 : iconBtnSize;
            const btnRadius = btnSize / 2;
            return (
              <Pressable
                key={i}
                onPress={a.onPress}
                style={({ pressed }) => [
                  styles.iconBtn,
                  {
                    width: btnSize,
                    height: btnSize,
                    borderRadius: btnRadius,
                    borderWidth: isCta ? 0 : iconBorderWidth,
                    backgroundColor: isCta ? 'transparent' : theme.colors.glass,
                    borderColor: theme.colors.hairlineStrong,
                    marginLeft: i ? 8 : 0,
                    opacity: pressed ? 0.7 : 1,
                    overflow: 'hidden',
                  },
                ]}
                hitSlop={8}
              >
                {isCta && (
                  <LinearGradient
                    colors={theme.gradientStops as unknown as readonly [string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: btnRadius }]}
                  />
                )}
                <Feather
                  name={a.icon}
                  size={isFloating || isCta ? 18 : 20}
                  color={isCta ? '#fff' : theme.colors.foreground}
                />
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
  // Bar height tightened 56 → 48. Combined with the 36px icon chips this
  // gives ~6px of clearance above/below the chips inside a comfortably-tall
  // bar — premium-feeling without consuming as much viewport as before.
  bar: { height: 48, flexDirection: 'row', alignItems: 'center' },
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
