import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenContainer, InlineHeader, Text, BondHeart } from '@/components';
import { useTheme } from '@/theme';

/**
 * "About this app" — the story behind The Secret Space.
 *
 * Intentionally minimal and emotional. No marketing copy, no feature list — that
 * lives in the rest of the app. This screen is a small letter from the maker to
 * whoever happens to be reading.
 *
 * Design choices:
 *   - A pulsing BondHeart at the top sets the emotional tone immediately.
 *   - Serif body type for the letter — feels handwritten, premium, slow to read.
 *   - Sections separated by light spacing, never with hard dividers — the letter
 *     should read as one continuous thought, not a settings page.
 *   - No CTA at the bottom. The user came here to read; let them leave when ready.
 */
export function AboutScreen() {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.06,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [fade, pulse]);

  return (
    <ScreenContainer scroll={false}>
      <InlineHeader title="About" showBack />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: theme.screenPadding, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: fade,
            alignItems: 'center',
            marginTop: 24,
            marginBottom: 36,
          }}
        >
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <BondHeart size={56} />
          </Animated.View>
          <Text variant="h1" align="center" style={{ marginTop: 24, fontSize: 28 }}>
            The Secret Space
          </Text>
          <Text variant="bodySmall" color="muted" align="center" style={{ marginTop: 8 }}>
            A private corner of the internet for two.
          </Text>
        </Animated.View>

        <Animated.View style={{ opacity: fade }}>
          {/* Soft glow card backdrop — gradient is intentionally muted so the
              typography does the emotional work, not the visual. */}
          <View
            style={[
              styles.letter,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.hairline,
              },
            ]}
          >
            <LinearGradient
              colors={[
                'rgba(232,99,122,0.08)',
                'rgba(201,169,110,0.04)',
                'transparent',
              ]}
              style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
            />

            <Text variant="overline" color="muted" style={{ marginBottom: 12 }}>
              A note from the maker
            </Text>

            <Letter>
              This started as a birthday gift for Disha — my love.
            </Letter>
            <Letter>
              The apps we already use felt too loud, too public, too crowded for what
              we actually wanted: a quiet place that was just ours.
            </Letter>
            <Letter>
              A space to write things we'd forget. To send little messages on autopilot
              when life gets busy. To save the photos we'd never post anywhere else.
              To remember why we chose each other in the first place, on the days that
              feel hard.
            </Letter>
            <Letter>
              It became home for us. Maybe it can become home for you too — for whoever
              you love, however quietly.
            </Letter>
            <Letter last>
              Use it gently. Make it yours.
            </Letter>

            {/* Two-line signature: attribution on the first line with a heart, the
                "shared with you" sits a step below as a quieter footnote — keeps the
                attribution and the dedication visually distinct. */}
            <View style={styles.signature}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="heart" size={14} color={theme.colors.primary} />
                <Text variant="caption" color="muted" style={{ marginLeft: 8 }}>
                  Built by Vishal · For Disha
                </Text>
              </View>
              <Text
                variant="caption"
                color="muted"
                style={{ marginTop: 6, opacity: 0.7 }}
              >
                Shared with you
              </Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Letter({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <Text
      variant="serifBody"
      style={{
        fontSize: 17,
        lineHeight: 28,
        marginBottom: last ? 24 : 18,
      }}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  letter: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    overflow: 'hidden',
  },
  signature: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
  },
});
