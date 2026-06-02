import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { Text } from './Text';

interface Segment<T extends string> {
  key: T;
  label: string;
  // `true` → small unmarked dot (legacy behaviour, kept for back-compat).
  // `number` → numeric pill with the count, capped visually at 99+. Use this
  // when the count is informative (e.g. "To Fulfill 3").
  badge?: boolean | number;
}

interface Props<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
}

export function SegmentedControl<T extends string>({ segments, value, onChange }: Props<T>) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
      ]}
    >
      {segments.map((s) => {
        const active = s.key === value;
        // Numeric badges are only rendered when > 0 — a zero count is a "no
        // attention needed" signal and should look identical to no badge.
        const numericBadge =
          typeof s.badge === 'number' && s.badge > 0 ? s.badge : null;
        const showDot = s.badge === true;
        return (
          <Pressable key={s.key} onPress={() => onChange(s.key)} style={styles.seg}>
            {active ? (
              <LinearGradient
                colors={theme.gradientStops as unknown as readonly [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 999 }]}
              />
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                variant="bodySmall"
                weight={active ? 'semibold' : 'medium'}
                style={{ color: active ? '#fff' : theme.colors.foregroundDim }}
              >
                {s.label}
              </Text>
              {numericBadge !== null && (
                <View
                  style={[
                    styles.countPill,
                    {
                      backgroundColor: active ? 'rgba(255,255,255,0.28)' : theme.colors.primary,
                    },
                  ]}
                >
                  <Text
                    variant="caption"
                    style={{
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: '700',
                      lineHeight: 12,
                    }}
                  >
                    {numericBadge > 99 ? '99+' : numericBadge}
                  </Text>
                </View>
              )}
            </View>
            {showDot && (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: theme.colors.primary },
                  active && { backgroundColor: '#fff' },
                ]}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    padding: 4,
  },
  seg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 12,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  countPill: {
    marginLeft: 6,
    minWidth: 18,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
