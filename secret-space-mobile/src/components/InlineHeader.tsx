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
  // `icon` (default) → glass chip.
  // `cta` → 40×40 gradient circle for the primary creation action on landing
  // screens (e.g. the + on Diary / Coupons). Mirrors the same prop on TopBar
  // so a header's action signature is portable between components.
  kind?: 'icon' | 'cta';
}

interface Props {
  // Optional title rendered on the left when no leadingElement is supplied.
  title?: string;
  // Custom left-side content (e.g., couple-initials, avatar+name composite). Wins
  // over title.
  leadingElement?: React.ReactNode;
  // Show a circular chevron-left back button on the left side. Overridden by
  // `leadingElement` if both are supplied.
  showBack?: boolean;
  // Custom back handler. Defaults to navigation.goBack() when not provided.
  onBack?: () => void;
  // Center slot — typically a BrandMark or ProgressBar for auth screens.
  centerElement?: React.ReactNode;
  // Right-side action chips.
  rightActions?: Action[];
  // Top padding above the row. Defaults to a tight 4pt — the screen's
  // SafeAreaView already supplies the status-bar inset, so the inline header
  // only needs minimal visual separation. The previous 12pt default produced
  // a total header height (64pt) that was actually TALLER than the solid
  // TopBar (56pt), inverting the intended "lighter" feel.
  paddingTop?: number;
  style?: ViewStyle;
}

/**
 * Lightweight inline header for every screen *except* Chat. Unlike TopBar, this
 * is not a fixed-position bar — it renders inline at the top of scroll content,
 * scrolls away naturally, and has no SafeAreaView wrapper (the screen's
 * ScreenContainer provides the top inset).
 *
 * Supports all the visual slots TopBar does (back chevron, leading element,
 * title, center element, right actions) but with a lighter visual treatment:
 * transparent background, no bottom hairline, slimmer 36px icon chips, no fixed
 * minimum height beyond what the content needs.
 *
 * Chat keeps the original TopBar component because its pinned partner-info
 * row genuinely needs the fixed positioning.
 */
export function InlineHeader({
  title,
  leadingElement,
  showBack = false,
  onBack,
  centerElement,
  rightActions = [],
  paddingTop = 4,
  style,
}: Props) {
  const theme = useTheme();
  const navigation = useNavigation();

  const handleBack = () => {
    if (onBack) return onBack();
    if (navigation.canGoBack()) navigation.goBack();
  };

  // Compose the left slot. Priority: leadingElement → back chevron → title
  // (title falls back to the center slot if a centerElement is supplied since
  // both in the same slot would conflict).
  const left = leadingElement
    ? leadingElement
    : showBack
      ? (
          <Pressable
            onPress={handleBack}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: theme.colors.glass,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="chevron-left" size={20} color={theme.colors.foreground} />
          </Pressable>
        )
      : title && !centerElement
        ? (
            <Text variant="h2" numberOfLines={1}>
              {title}
            </Text>
          )
        : null;

  // Center slot — only used when centerElement is supplied OR when there's a
  // title AND a back/leading element (title shifts to center for that pattern).
  const center = centerElement
    ? centerElement
    : title && (showBack || leadingElement)
      ? (
          <Text variant="bodyMedium" numberOfLines={1}>
            {title}
          </Text>
        )
      : null;

  return (
    // No SafeAreaView wrap — the parent ScreenContainer now applies the top
    // inset deterministically (via useSafeAreaInsets + StatusBar.currentHeight),
    // so wrapping here would either double-pad or fight the parent's logic.
    // The `paddingTop` prop is purely cosmetic breathing room above the row.
    <View
      style={[
        styles.row,
        { paddingHorizontal: theme.screenPadding, paddingTop, paddingBottom: 4 },
        style,
      ]}
    >
      <View style={styles.side}>{left}</View>

      <View style={styles.center}>{center}</View>

      <View style={[styles.side, { justifyContent: 'flex-end' }]}>
        {rightActions.map((a, i) => {
          const numericBadge = typeof a.badge === 'number' ? a.badge : null;
          const showDot = a.badge === true;
          const isCta = a.kind === 'cta';
          // CTA action: 40×40 gradient circle — primary creation affordance
          // (the + on Diary / Coupons). Visually heavier than the 36×36
          // secondary icon chips so the user's eye lands here first.
          const btnSize = isCta ? 40 : 36;
          const btnRadius = btnSize / 2;
          return (
            <Pressable
              key={i}
              onPress={a.onPress}
              hitSlop={8}
              style={({ pressed }) => [
                styles.iconBtn,
                {
                  width: btnSize,
                  height: btnSize,
                  borderRadius: btnRadius,
                  backgroundColor: isCta ? 'transparent' : theme.colors.glass,
                  // Tightened 10 → 8 to match TopBar's right-action gap. The
                  // 2pt extra in the old InlineHeader produced subtly
                  // different rhythms between bar variants.
                  marginLeft: i ? 8 : 0,
                  opacity: pressed ? 0.7 : 1,
                  overflow: 'hidden',
                },
              ]}
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
                size={isCta ? 20 : 18}
                color={isCta ? '#fff' : theme.colors.foreground}
              />
              {showDot && (
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: theme.colors.primary, borderColor: theme.colors.background },
                  ]}
                />
              )}
              {numericBadge !== null && numericBadge > 0 && (
                <View
                  style={[
                    styles.count,
                    { backgroundColor: theme.colors.primary, borderColor: theme.colors.background },
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
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // minHeight 44 → 40. With paddingTop/Bottom now 4/4, total header height
    // is 48pt — matching the new TopBar height for cross-variant rhythm.
    minHeight: 40,
  },
  // Side slots size to their content; center takes the remaining space. Min-width
  // 40 reserves enough room for a single icon chip so the center can stay centered
  // even when one side is empty.
  side: { flexDirection: 'row', alignItems: 'center', minWidth: 40 },
  center: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  // Dimensions (width/height/borderRadius) are applied dynamically per-action
  // based on `kind` — only layout properties shared across both icon and CTA
  // variants live here.
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
