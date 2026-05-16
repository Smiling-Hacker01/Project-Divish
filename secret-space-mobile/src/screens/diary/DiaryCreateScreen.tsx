import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar, Text, Button, SegmentedControl, Card } from '@/components';
import { useTheme } from '@/theme';
import { diaryApi } from '@/api';
import { DiaryType } from '@/types/api';

export function DiaryCreateScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const [mode, setMode] = useState<DiaryType>('text');
  const [content, setContent] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [milestone, setMilestone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const valid = mode === 'text' ? content.trim().length > 0 : !!image;

  const pickImage = async (source: 'camera' | 'library') => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
      allowsEditing: true,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
    if (!result.canceled && result.assets[0]?.base64) {
      // Store raw base64 — backend uploads to Cloudinary if `content.length > 200`.
      setImage(result.assets[0].base64);
    }
  };

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      await diaryApi.create({
        type: mode,
        content: mode === 'text' ? content.trim() : image ?? '',
      });
      navigation.goBack();
    } catch (e: any) {
      console.warn('[Diary create] failed', e?.response?.data ?? e?.message);
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
        title="New entry"
        rightActions={[]}
      />
      <View style={{ flex: 1, paddingHorizontal: theme.screenPadding }}>
        <View style={{ alignSelf: 'flex-end', marginTop: -44, marginBottom: 8 }}>
          <Button label="Post" size="sm" onPress={submit} disabled={!valid} loading={submitting} />
        </View>

        <SegmentedControl
          segments={[
            { key: 'text', label: 'Text' },
            { key: 'image', label: 'Photo' },
            { key: 'video', label: 'Video' },
          ]}
          value={mode}
          onChange={(k) => setMode(k as DiaryType)}
        />

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {mode === 'text' && (
            <View style={{ flex: 1, marginTop: 24 }}>
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder="What happened today…"
                placeholderTextColor={theme.colors.muted}
                multiline
                autoFocus
                textAlignVertical="top"
                style={{
                  flex: 1,
                  fontFamily: theme.typography.serifQuote.fontFamily,
                  fontSize: 22,
                  lineHeight: 32,
                  color: theme.colors.foreground,
                  padding: 0,
                }}
              />
            </View>
          )}

          {mode === 'image' && (
            <View style={{ marginTop: 24 }}>
              {image ? (
                <View>
                  <Image source={{ uri: `data:image/jpeg;base64,${image}` }} style={styles.preview} />
                  <Pressable
                    onPress={() => setImage(null)}
                    style={[styles.removeBtn, { backgroundColor: theme.colors.surface }]}
                  >
                    <Feather name="x" size={16} color={theme.colors.foreground} />
                  </Pressable>
                </View>
              ) : (
                <View
                  style={[
                    styles.dropzone,
                    { borderColor: theme.colors.hairlineStrong, backgroundColor: theme.colors.glass },
                  ]}
                >
                  <Feather name="image" size={32} color={theme.colors.muted} />
                  <Text variant="bodyMedium" style={{ marginTop: 12 }}>
                    Tap to add a photo
                  </Text>
                  <Text variant="caption" color="muted" style={{ marginTop: 4 }}>
                    JPG or PNG · up to 20MB
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                <Button
                  label="Camera"
                  leadingIcon="camera"
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => pickImage('camera')}
                />
                <Button
                  label="Library"
                  leadingIcon="image"
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => pickImage('library')}
                />
              </View>
            </View>
          )}

          {mode === 'video' && (
            <Card variant="glass" style={{ marginTop: 24, alignItems: 'center', paddingVertical: 40 }}>
              <Feather name="film" size={32} color={theme.colors.muted} style={{ opacity: 0.5 }} />
              <Text variant="h3" style={{ marginTop: 16 }}>
                Coming soon
              </Text>
              <Text variant="bodySmall" color="muted" style={{ marginTop: 8 }}>
                Video diary entries will land in v2.
              </Text>
            </Card>
          )}
        </KeyboardAvoidingView>

        <View style={[styles.metaRow, { borderTopColor: theme.colors.hairline }]}>
          <View
            style={[
              styles.datePill,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
            ]}
          >
            <Feather name="calendar" size={14} color={theme.colors.foreground} />
            <Text variant="caption" weight="medium" style={{ marginLeft: 6 }}>
              TODAY
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => setMilestone(!milestone)} style={styles.milestone}>
            <Feather
              name="star"
              size={16}
              color={milestone ? theme.colors.accent : theme.colors.muted}
              style={{ marginRight: 6 }}
            />
            <Text variant="bodySmall" weight="medium">
              Mark as milestone
            </Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', aspectRatio: 1, borderRadius: 20 },
  removeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropzone: {
    aspectRatio: 1,
    borderRadius: 28,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
  },
  milestone: { flexDirection: 'row', alignItems: 'center' },
});
