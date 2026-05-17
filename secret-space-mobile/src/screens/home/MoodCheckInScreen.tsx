import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar, Text, Button, Input, Emoji } from '@/components';
import { useTheme } from '@/theme';
import { Mood } from '@/types/api';
import { moodApi } from '@/api';
import { useAuth } from '@/context/AuthContext';

const moods: { mood: Mood; label: string }[] = [
  { mood: '😊', label: 'Happy' },
  { mood: '❤️', label: 'Loved' },
  { mood: '⚡', label: 'Energized' },
  { mood: '💭', label: 'Missing you' },
  { mood: '😔', label: 'Sad' },
  { mood: '🌧', label: 'Low' },
  { mood: '😣', label: 'Stressed' },
  { mood: '😠', label: 'Upset' },
  { mood: '😤', label: 'Grumpy' },
];

export function MoodCheckInScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { user } = useAuth();
  const [selected, setSelected] = useState<Mood | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await moodApi.set(selected, note.trim() || undefined);
      setDone(true);
      setTimeout(() => navigation.goBack(), 1200);
    } catch (e: any) {
      console.warn('[Mood] failed', e?.response?.data ?? e?.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done && selected) {
    return (
      <ScreenContainer>
        <TopBar showBack={false} rightActions={[{ icon: 'x', onPress: () => navigation.goBack() }]} />
        <View style={[styles.confirmWrap, { paddingHorizontal: theme.screenPadding }]}>
          <Emoji size={80}>{selected}</Emoji>
          <Text variant="h2" align="center" style={{ marginTop: 16 }}>
            Shared
          </Text>
          <Text variant="body" color="muted" align="center" style={{ marginTop: 8 }}>
            {user?.partnerName ?? 'Your partner'} will see this in a second.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer glowCorner="top-right">
      <TopBar
        title="How are you feeling?"
        showBack={false}
        rightActions={[{ icon: 'x', onPress: () => navigation.goBack() }]}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.select({ ios: 0, android: 24 })}
      >
        <ScrollView
          contentContainerStyle={[styles.wrap, { paddingHorizontal: theme.screenPadding }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text variant="bodySmall" color="muted" align="center" style={{ marginTop: 8 }}>
            Let {user?.partnerName ?? 'them'} know your vibe
          </Text>

          <View style={styles.grid}>
            {moods.map((m) => {
              const isSelected = selected === m.mood;
              return (
                <Pressable key={m.mood} onPress={() => setSelected(m.mood)} style={styles.cellWrap}>
                  <View
                    style={[
                      styles.cell,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: isSelected ? 'transparent' : theme.colors.hairline,
                        borderWidth: isSelected ? 0 : 1,
                        transform: [{ scale: isSelected ? 1.04 : 1 }],
                        opacity: !selected || isSelected ? 1 : 0.55,
                      },
                    ]}
                  >
                    {isSelected && (
                      <LinearGradient
                        colors={['rgba(232,99,122,0.18)', 'rgba(201,169,110,0.18)']}
                        style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
                      />
                    )}
                    {isSelected && (
                      <View
                        style={[
                          StyleSheet.absoluteFillObject,
                          { borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(232,99,122,0.6)' },
                        ]}
                      />
                    )}
                    <Emoji size={36}>{m.mood}</Emoji>
                    <Text variant="caption" style={{ marginTop: 6 }} weight="medium">
                      {m.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: 32 }}>
            <Input label="Want to add a note?" value={note} onChangeText={setNote} maxLength={120} />
            <Text variant="caption" color="muted" style={{ marginTop: 6, marginLeft: 4 }}>
              {note.trim()
                ? "Your note will be sent — we'll skip the canned message."
                : "If you leave this empty, we'll send a sweet pre-written note for this mood."}
            </Text>
          </View>

          <View style={styles.ctaWrap}>
            <Button
              label={selected ? `Share with ${user?.partnerName ?? 'them'}` : 'Pick a mood first'}
              fullWidth
              onPress={submit}
              disabled={!selected}
              loading={submitting}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, paddingTop: 8, paddingBottom: 32 },
  ctaWrap: { marginTop: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 32, marginHorizontal: -8 },
  cellWrap: { width: '33.333%', padding: 8 },
  cell: {
    aspectRatio: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  confirmWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
