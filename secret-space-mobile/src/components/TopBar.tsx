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
}: Props) {
  const theme = useTheme();
  const navigation = useNavigation();
  const handleBack = () => {
    if (onBack) return onBack();
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <SafeAreaView
      edges={['top']}
      // Note: SafeAreaView from react-native-safe-area-context is frame-aware. When a
      // parent SafeAreaView has already applied the top inset, this one resolves to 0
      // — no double-padding. When the parent hasn't (or fails to, as on some Samsung
      // Android builds with newArchEnabled), this one applies the inset itself.
      style={{
        backgroundColor: opaque ? theme.colors.background : 'transparent',
        borderBottomWidth: opaque ? StyleSheet.hairlineWidth : 0,
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
                  backgroundColor: theme.colors.glass,
                  borderColor: theme.colors.hairlineStrong,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              hitSlop={8}
            >
              <Feather name="chevron-left" size={22} color={theme.colors.foreground} />
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
                    backgroundColor: theme.colors.glass,
                    borderColor: theme.colors.hairlineStrong,
                    marginLeft: i ? 8 : 0,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                hitSlop={8}
              >
                <Feather name={a.icon} size={20} color={theme.colors.foreground} />
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
    </SafeAreaView>
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
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
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
