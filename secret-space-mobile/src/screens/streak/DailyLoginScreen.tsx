import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Text, Button, BondHeart, GlassSurface } from '@/components';
import { useTheme } from '@/theme';

export function DailyLoginScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const day = 47;
  const week = [true, true, true, true, true, true, false];
  const today = 5;

  return (
    <View style={styles.scrim}>
      <Pressable onPress={() => navigation.goBack()} style={styles.dismiss} hitSlop={8}>
        <Feather name="x" size={20} color="#fff" />
      </Pressable>
      <GlassSurface radius={28} style={[styles.card, theme.shadows.glow]}>
        <View style={{ padding: 24, alignItems: 'center' }}>
          <BondHeart size={56} />
          <Text variant="overline" color="muted" style={{ marginTop: 24 }}>
            Day
          </Text>
          <Text variant="numeralLarge" style={{ marginTop: 4 }}>
            {day}
          </Text>
          <Text variant="bodySmall" color="muted">
            of loving each other
          </Text>

          <View style={styles.streak}>
            {week.map((on, i) => {
              const isToday = i === today;
              if (isToday)
                return (
                  <LinearGradient
                    key={i}
                    colors={theme.gradientStops as unknown as readonly [string, string]}
                    style={[styles.streakDot, theme.shadows.glowSoft]}
                  />
                );
              return (
                <View
                  key={i}
                  style={[
                    styles.streakDot,
                    {
                      backgroundColor: on ? theme.colors.accent : 'transparent',
                      borderColor: theme.colors.hairlineStrong,
                      borderWidth: on ? 0 : 1,
                    },
                  ]}
                />
              );
            })}
          </View>

          <View style={[styles.reward, { backgroundColor: 'rgba(201,169,110,0.18)' }]}>
            <Feather name="gift" size={12} color={theme.colors.accent} />
            <Text variant="caption" weight="medium" style={{ marginLeft: 6 }}>
              +1 reason added to Love Bot
            </Text>
          </View>
        </View>
      </GlassSurface>

      <View style={{ width: '100%', paddingHorizontal: 24, marginTop: 24 }}>
        <Button label="Continue" fullWidth onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dismiss: { position: 'absolute', top: 56, right: 24, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  card: { width: '100%', maxWidth: 360 },
  streak: { flexDirection: 'row', gap: 8, marginTop: 16 },
  streakDot: { width: 16, height: 16, borderRadius: 8 },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 16,
  },
});
