import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, TopBar, Text, Avatar, Card } from '@/components';
import { useTheme } from '@/theme';
import { diaryApi } from '@/api';
import { DiaryEntry } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { useChatSocket } from '@/context/ChatSocketContext';
import { fullUrl, videoPosterUrl } from '@/utils/cloudinary';
import { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DiaryDetail'>;

export function DiaryDetailScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const { user } = useAuth();
  const { subscribeDiary } = useChatSocket();
  const [entry, setEntry] = useState<DiaryEntry | null>(null);
  const [reply, setReply] = useState('');

  const refetch = useCallback(async () => {
    try {
      const e = await diaryApi.get(route.params.id);
      setEntry(e);
    } catch {
      // ignore — backend 404 means the entry was deleted by the partner; just stay
      // mounted with the last known state and let the user navigate away.
    }
  }, [route.params.id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Realtime: if the partner reacts/comments or deletes this entry while we're on the
  // detail screen, refresh in place. We filter to events for *this* entry only so
  // unrelated diary changes don't trigger a refetch.
  useEffect(() => {
    const unsubscribe = subscribeDiary((evt) => {
      if (evt.entryId === route.params.id) refetch();
    });
    return unsubscribe;
  }, [subscribeDiary, route.params.id, refetch]);

  const toggleLike = async () => {
    if (!entry) return;
    const wasLiked = !!entry.userLiked;
    const next = !wasLiked;
    // Optimistic flip; revert on failure. `userLiked` is now authoritative from the
    // server, so we don't keep a parallel `liked` state any more.
    setEntry((e) =>
      e
        ? {
            ...e,
            userLiked: next,
            likes: Math.max(0, (e.likes ?? 0) + (next ? 1 : -1)),
          }
        : e
    );
    try {
      await diaryApi.like(entry.id, next);
    } catch {
      setEntry((e) =>
        e
          ? {
              ...e,
              userLiked: wasLiked,
              likes: Math.max(0, (e.likes ?? 0) + (next ? -1 : 1)),
            }
          : e
      );
    }
  };

  const sendReply = async () => {
    if (!entry || !reply.trim()) return;
    const text = reply.trim();
    setReply('');
    setEntry((e) => (e ? { ...e, comments: (e.comments ?? 0) + 1 } : e));
    try {
      await diaryApi.comment(entry.id, text);
      await refetch();
    } catch {
      setEntry((e) => (e ? { ...e, comments: Math.max(0, (e.comments ?? 0) - 1) } : e));
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete this entry?',
      'It will be replaced with a tombstone so your partner knows something was removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!entry) return;
            try {
              await diaryApi.remove(entry.id);
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Could not delete', e?.response?.data?.error ?? e?.message ?? 'Try again.');
            }
          },
        },
      ]
    );
  };

  if (!entry) {
    return (
      <ScreenContainer>
        <TopBar title="" />
      </ScreenContainer>
    );
  }

  const partnerName = user?.partnerName ?? 'Partner';
  const isOwner = entry.author === 'you';
  const authorName = isOwner ? user?.name ?? 'You' : entry.authorName ?? partnerName;
  // Own entries pull the live avatar from AuthContext; partner entries use the
  // snapshot the backend embedded in the entry payload.
  const authorAvatar = isOwner
    ? user?.avatarUrl ?? null
    : entry.authorAvatar ?? null;
  const isDeleted = !!entry.deletedAt;

  // Prefer the discrete fields the new serializer returns; fall back to the legacy
  // collapsed `content` for older cached data.
  const textBody = entry.text ?? (entry.type === 'text' ? entry.content : null);
  const rawMedia = entry.mediaUrl ?? (entry.type !== 'text' ? entry.content : null);
  const hasImage = entry.type === 'image' && !!rawMedia && !isDeleted;
  const hasVideo = entry.type === 'video' && !!rawMedia && !isDeleted;
  const heroImageUri = hasImage ? fullUrl(rawMedia) : null;
  const videoPoster = hasVideo ? entry.thumbnailUrl ?? videoPosterUrl(rawMedia) : null;

  return (
    <ScreenContainer scroll={false}>
      <TopBar
        title=""
        rightActions={isOwner && !isDeleted ? [{ icon: 'trash-2', onPress: confirmDelete }] : []}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
          {hasImage && (
            <View>
              <ExpoImage
                source={{ uri: heroImageUri ?? rawMedia ?? '' }}
                style={styles.hero}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={styles.scrim} />
              <View style={[styles.heroMeta, { paddingHorizontal: theme.screenPadding }]}>
                <Avatar
                  uri={authorAvatar}
                  name={authorName}
                  size={32}
                  ring={entry.author === 'you' ? 'rose' : 'gold'}
                />
                <Text variant="bodySmall" weight="medium" style={{ color: '#fff', marginLeft: 10 }}>
                  {authorName}
                </Text>
                <Text variant="caption" style={{ color: 'rgba(255,255,255,0.7)', marginLeft: 6 }}>
                  · {new Date(entry.timestamp).toLocaleString()}
                </Text>
              </View>
            </View>
          )}

          {hasVideo && rawMedia && (
            <View>
              <Video
                source={{ uri: rawMedia }}
                style={styles.hero}
                useNativeControls
                resizeMode={ResizeMode.COVER}
                shouldPlay={false}
                // Poster shows instantly while the player initializes — eliminates the
                // black-rectangle flash that the old implementation had on tap.
                usePoster
                posterSource={videoPoster ? { uri: videoPoster } : undefined}
                posterStyle={styles.hero as any}
              />
              <View style={[styles.heroMeta, { paddingHorizontal: theme.screenPadding }]}>
                <Avatar
                  uri={authorAvatar}
                  name={authorName}
                  size={32}
                  ring={entry.author === 'you' ? 'rose' : 'gold'}
                />
                <Text variant="bodySmall" weight="medium" style={{ color: '#fff', marginLeft: 10 }}>
                  {authorName}
                </Text>
                <Text variant="caption" style={{ color: 'rgba(255,255,255,0.7)', marginLeft: 6 }}>
                  · {new Date(entry.timestamp).toLocaleString()}
                </Text>
              </View>
            </View>
          )}

          <View style={{ padding: theme.screenPadding, paddingTop: hasImage || hasVideo ? 24 : 0 }}>
            {isDeleted ? (
              <View
                style={[
                  styles.tombstone,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
                ]}
              >
                <Feather name="slash" size={16} color={theme.colors.muted} />
                <Text variant="bodySmall" color="muted" style={{ marginLeft: 8, fontStyle: 'italic' }}>
                  {textBody || 'Entry was removed.'}
                </Text>
                <Text variant="caption" color="muted" style={{ marginTop: 6, marginLeft: 24 }}>
                  Removed {new Date(entry.deletedAt!).toLocaleString()}
                </Text>
              </View>
            ) : (
              !!textBody && (
                <>
                  <Text variant="serifBody" style={{ fontSize: 19, lineHeight: 30 }}>
                    {textBody}
                  </Text>
                  {entry.editedAt && (
                    <Text variant="caption" color="muted" style={{ marginTop: 8, fontStyle: 'italic' }}>
                      edited · {new Date(entry.editedAt).toLocaleString()}
                    </Text>
                  )}
                </>
              )
            )}

            {!isDeleted && (
              <View style={styles.actions}>
                <Pressable onPress={toggleLike} style={styles.likeBtn} hitSlop={8}>
                  <Feather
                    name="heart"
                    size={28}
                    color={entry.userLiked ? theme.colors.primary : theme.colors.muted}
                  />
                  <Text variant="bodyMedium" style={{ marginLeft: 8 }}>
                    {entry.likes}
                  </Text>
                </Pressable>
              </View>
            )}

            {!isDeleted && (
              <View style={{ marginTop: 24, gap: 12 }}>
                {(entry.commentsList ?? []).map((c) => {
                  // For my own comments, prefer the live avatar from AuthContext so a
                  // freshly-changed profile picture appears without a refetch round-trip.
                  const isMineComment = c.authorId === user?.id;
                  const commentAvatar = isMineComment
                    ? user?.avatarUrl ?? null
                    : c.authorAvatar ?? null;
                  return (
                    <Card key={c.id} variant="glass" padding={16}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Avatar uri={commentAvatar} name={c.author} size={24} />
                        <Text variant="bodySmall" weight="medium" style={{ marginLeft: 8 }}>
                          {c.author}
                        </Text>
                        <Text variant="caption" color="muted" style={{ marginLeft: 8 }}>
                          {timeAgo(c.timestamp)}
                        </Text>
                      </View>
                      <Text variant="serifBody" style={{ fontSize: 16, marginTop: 8 }}>
                        {c.text}
                      </Text>
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        {!isDeleted && (
          <View
            style={[
              styles.composer,
              { backgroundColor: theme.colors.glassStrong, borderTopColor: theme.colors.hairline },
            ]}
          >
            <Avatar uri={user?.avatarUrl ?? null} name={user?.name ?? 'You'} size={32} ring="rose" />
            <TextInput
              value={reply}
              onChangeText={setReply}
              placeholder="Add a reply…"
              placeholderTextColor={theme.colors.muted}
              style={[
                styles.input,
                { color: theme.colors.foreground, fontFamily: theme.typography.body.fontFamily },
              ]}
              maxLength={1000}
            />
            <Pressable onPress={sendReply} disabled={!reply.trim()}>
              <LinearGradient
                colors={theme.gradientStops as unknown as readonly [string, string]}
                style={[styles.sendBtn, { opacity: reply.trim() ? 1 : 0.4 }]}
              >
                <Feather name="send" size={16} color="#fff" />
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

const styles = StyleSheet.create({
  hero: { width: '100%', aspectRatio: 1, maxHeight: 380, backgroundColor: '#000' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 96 },
  heroMeta: { position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
  likeBtn: { flexDirection: 'row', alignItems: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: 14,
    marginHorizontal: 10,
    borderRadius: 22,
    fontSize: 14,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tombstone: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
});
