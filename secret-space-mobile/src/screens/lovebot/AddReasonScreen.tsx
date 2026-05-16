import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar, Text, Button, Chip } from '@/components';
import { useTheme } from '@/theme';
import { lovebotApi } from '@/api';

const PLACEHOLDERS = [
  '…the way they laugh',
  '…how they make coffee',
  '…their morning sleep voice',
  '…that thing they do at concerts',
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
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await lovebotApi.addReason({ text: text.trim(), forPartner: true });
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
          <Pressable onPress={() => navigation.goBack()}>
            <Text variant="bodyMedium" color="primary">
              Cancel
            </Text>
          </Pressable>
        }
        title="Why you love them"
      />
      <View style={{ alignSelf: 'flex-end', marginTop: -44, marginRight: theme.screenPadding, marginBottom: 8 }}>
        <Button label="Save" size="sm" onPress={submit} disabled={!text.trim()} loading={submitting} />
      </View>

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
