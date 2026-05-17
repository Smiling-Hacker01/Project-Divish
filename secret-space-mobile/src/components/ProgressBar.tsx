import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';

interface Props {
  total: number;
  current: number;
  segmentWidth?: number;
}

export function ProgressBar({ total, current, segmentWidth = 64 }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < current;
        return (
          <View
            key={i}
            style={[
              styles.segment,
              {
                width: segmentWidth,
                backgroundColor: filled ? 'transparent' : theme.colors.hairlineStrong,
                borderColor: theme.colors.hairlineStrong,
                borderWidth: filled ? 0 : 1,
              },
            ]}
          >
            {filled && (
              <LinearGradient
                colors={theme.gradientStops as unknown as readonly [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  segment: { height: 4, borderRadius: 2, overflow: 'hidden' },
});
