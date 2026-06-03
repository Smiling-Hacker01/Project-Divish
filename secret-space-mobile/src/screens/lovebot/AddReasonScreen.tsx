import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar, Text, Button, Chip } from '@/components';
import { useTheme } from '@/theme';
import { lovebotApi } from '@/api';

// Placeholders teach the canonical reason shape: a complete sentence that
// starts with "Because…". Both auto-generated reasons (Gemini + fallback bank)
// and manually-added reasons follow this rule, so the queue reads as one
// uniform voice no matter which path produced the entry. Mixing fragments
// like "…the way they laugh" with full Gemini sentences was producing a
// "Because the way they laugh" / "Because Because…" disconnect.
const PLACEHOLDERS = [
  'Because of the way they laugh in their sleep…',
  'Because they make coffee just the way I like it…',
  'Because of that thing they do at concerts…',
  'Because their morning voice is the safest sound I know…',
];

const VIBES = ['Sweet', 'Playful', 'Heartfelt', 'Inside joke', 'Spicy'] as const;

export function AddReasonScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const [text, setText] = useState('');
  const [vibes, setVibes] = useState<string[]>([]);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length), 4000);
    return () => clearInterval(id);
  }, []);

  const toggleVibe = (v: string) => {
    setVibes((prev) => {
      if (prev.includes(v)) return prev.filter((x) => x !== v);
      if (prev.length >= 2) return [prev[1], v];
      return [...prev, v];
    });
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Silently normalize to the canonical "Because…" shape so user-typed
    // and auto-generated reasons read with the same opening. Placeholders
    // already teach this pattern, but a user who types a fragment
    // ("the way they laugh") still gets it as "Because the way they
    // laugh." rather than persisting a fragment that would render oddly
    // in the queue. A user who already started with "because" gets it
    // capitalized.
    let normalized: string;
    if (/^because\b/i.test(trimmed)) {
      normalized = 'B' + trimmed.slice(1);
    } else {
      normalized = 'Because ' + trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
    }

    setSubmitting(true);
    try {
      await lovebotApi.addReason({ text: normalized, forPartner: true });
      navigation.goBack();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <TopBar
        showBack={false}
        leadingElement={
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text variant="bodyMedium" color="primary">
              Cancel
            </Text>
          </Pressable>
        }
        title="Why you love them"
        // Save lives in the bar's trailingElement slot, mirroring DiaryCreate
        // and CouponCreate. This replaces the old `marginTop: -44` overlay hack
        // which was tuned to the previous 56px bar height and broke (button sat
        // ~8px too low) when the bar tightened to 48px.
        trailingElement={
          <Button label="Save" size="sm" onPress={submit} disabled={!text.trim()} loading={submitting} />
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, paddingHorizontal: theme.screenPadding, paddingTop: 8 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={PLACEHOLDERS[placeholderIndex]}
            placeholderTextColor={theme.colors.muted}
            multiline
            autoFocus
            textAlignVertical="top"
            style={{
              minHeight: 160,
              fontFamily: theme.typography.serifQuote.fontFamily,
              fontSize: 22,
              lineHeight: 32,
              color: theme.colors.foreground,
              padding: 0,
            }}
            maxLength={280}
          />

          <View style={[styles.divider, { backgroundColor: theme.colors.hairline }]} />
          <Text variant="caption" color="muted" align="right">
            {text.length} / 280
          </Text>

          <Text variant="overline" color="muted" style={{ marginTop: 24 }}>
            Vibe
          </Text>
          <View style={styles.chipRow}>
            {VIBES.map((v) => (
              <Chip
                key={v}
                label={v}
                tone={vibes.includes(v) ? 'gradient' : 'glass'}
                selected={vibes.includes(v)}
                onPress={() => toggleVibe(v)}
              />
            ))}
          </View>

          <Text variant="caption" color="muted" align="center" style={{ marginTop: 'auto', marginBottom: 24 }}>
            This will be sent at your next scheduled time.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  divider: { height: 1, marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
});
