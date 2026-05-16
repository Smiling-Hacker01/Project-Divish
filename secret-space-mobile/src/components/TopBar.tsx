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
}

export function TopBar({
  title,
  showBack = true,
  onBack,
  rightActions = [],
  leadingElement,
  centerElement,
  style,
}: Props) {
  const theme = useTheme();
  const navigation = useNavigation();
  const handleBack = () => {
    if (onBack) return onBack();
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
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
  );
}

const styles = StyleSheet.create({
  bar: { height: 56, flexDirection: 'row', alignItems: 'center' },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  center: { flex: 2, alignItems: 'center' },
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
