import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { Text } from './Text';

interface Action {
  icon: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  // `true` shows a dot (unspecified count); a number shows that count, capped at 99+.
  badge?: boolean | number;
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
  // Top padding above the row. Defaults to small breathing room — the screen's
  // SafeAreaView already supplies the status-bar inset, so the inline header just
  // needs visual separation, not full chrome height.
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
  paddingTop = 12,
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
    // SafeAreaView edges={['top']} for defense-in-depth. If the parent
    // ScreenContainer already applied the top inset (the common case),
    // react-native-safe-area-context's frame-aware logic makes this one resolve
    // to 0 — no double-padding. If the parent failed to (Samsung Android +
    // newArchEnabled occasionally drops the inset), this one applies it itself
    // so the header is never under the status bar.
    <SafeAreaView edges={['top']}>
      <View
        style={[
          styles.row,
          { paddingHorizontal: theme.screenPadding, paddingTop, paddingBottom: 8 },
          style,
        ]}
      >
        <View style={styles.side}>{left}</View>

        <View style={styles.center}>{center}</View>

        <View style={[styles.side, { justifyContent: 'flex-end' }]}>
          {rightActions.map((a, i) => {
          const numericBadge = typeof a.badge === 'number' ? a.badge : null;
          const showDot = a.badge === true;
          return (
            <Pressable
              key={i}
              onPress={a.onPress}
              hitSlop={8}
              style={({ pressed }) => [
                styles.iconBtn,
                {
                  backgroundColor: theme.colors.glass,
                  marginLeft: i ? 10 : 0,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Feather name={a.icon} size={18} color={theme.colors.foreground} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  // Side slots size to their content; center takes the remaining space. Min-width
  // 40 reserves enough room for a single icon chip so the center can stay centered
  // even when one side is empty.
  side: { flexDirection: 'row', alignItems: 'center', minWidth: 40 },
  center: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
