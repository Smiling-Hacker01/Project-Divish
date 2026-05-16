import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { Text } from './Text';

interface Segment<T extends string> {
  key: T;
  label: string;
  badge?: boolean;
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
            <Text
              variant="bodySmall"
              weight={active ? 'semibold' : 'medium'}
              style={{ color: active ? '#fff' : theme.colors.foregroundDim }}
            >
              {s.label}
            </Text>
            {s.badge && (
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
});
