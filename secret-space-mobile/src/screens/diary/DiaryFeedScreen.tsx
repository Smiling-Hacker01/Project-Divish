import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View, FlatList } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScreenContainer, Text, Card, Avatar, EmptyState, SegmentedControl } from '@/components';
import { useTheme } from '@/theme';
import { diaryApi } from '@/api';
import { DiaryEntry } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { useChatSocket } from '@/context/ChatSocketContext';
import { thumbUrl, videoPosterUrl } from '@/utils/cloudinary';
import { diaryQueue } from '@/services/diaryQueue';

type Filter = 'all' | 'mine' | 'theirs';

const PAGE_SIZE = 20;

export function DiaryFeedScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { subscribeDiary, status: socketStatus } = useChatSocket();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // Number of queued/failed diary posts — surfaces a banner at the top with a retry CTA.
  const [pendingCount, setPendingCount] = useState(0);

  // Guard against late responses overwriting the page after the user has refreshed —
  // we bump an epoch on every fresh fetch and discard responses whose epoch is stale.
  const fetchEpoch = useRef(0);

  const reload = useCallback(async () => {
    const epoch = ++fetchEpoch.current;
    try {
      const page = await diaryApi.list({ limit: PAGE_SIZE });
      if (epoch !== fetchEpoch.current) return;
      setEntries(page.entries);
      setNextCursor(page.nextCursor);
    } catch {
      // surface via empty fallback
    } finally {
      if (epoch === fetchEpoch.current) setInitialLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !nextCursor) return;
    setLoadingMore(true);
    const epoch = fetchEpoch.current;
    try {
      const page = await diaryApi.list({ cursor: nextCursor, limit: PAGE_SIZE });
      if (epoch !== fetchEpoch.current) return;
      // De-dupe in case a realtime insertion landed between pages.
      setEntries((prev) => {
        const ids = new Set(prev.map((e) => e.id));
        return [...prev, ...page.entries.filter((e) => !ids.has(e.id))];
      });
      setNextCursor(page.nextCursor);
    } finally {
      if (epoch === fetchEpoch.current) setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  // Initial mount + refocus refresh. Reload (not append) on focus so the user always
  // lands on the latest state when returning from compose/detail.
  useEffect(() => {
    reload();
  }, [reload]);
  useFocusEffect(
    useCallback(() => {
      reload();
      diaryQueue.list().then((q) => setPendingCount(q.length));
    }, [reload])
  );

  // Realtime: a single diary_changed event from the partner means we should refetch the
  // first page so reactions/comments stay accurate without manual pull-to-refresh.
  useEffect(() => {
    const unsubscribe = subscribeDiary(() => {
      reload();
    });
    return unsubscribe;
  }, [subscribeDiary, reload]);

  // When the socket flips back to connected (e.g. after a disconnect), nudge the queue
  // replay path: the create flow lives in DiaryCreateScreen, but failed entries can be
  // user-triggered via the banner. We just refresh the count.
  useEffect(() => {
    if (socketStatus === 'connected') {
      diaryQueue.list().then((q) => setPendingCount(q.length));
    }
  }, [socketStatus]);

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    diaryQueue.list().then((q) => setPendingCount(q.length));
    setRefreshing(false);
  };

  // Backend returns `author: 'you' | 'partner'`. Filter client-side.
  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (filter === 'all') return true;
        if (filter === 'mine') return e.author === 'you';
        return e.author === 'partner';
      }),
    [entries, filter]
  );

  return (
    <ScreenContainer scroll={false}>
      <View style={[styles.header, { paddingHorizontal: theme.screenPadding, paddingTop: 16 }]}>
        <Text variant="h1">Our Diary</Text>
        <Pressable onPress={() => navigation.navigate('DiaryCreate')} hitSlop={8}>
          <LinearGradient
            colors={theme.gradientStops as unknown as readonly [string, string]}
            style={[styles.addBtn, theme.shadows.glowSoft]}
          >
            <Feather name="plus" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: theme.screenPadding, marginTop: 12 }}>
        <SegmentedControl
          segments={[
            { key: 'all', label: 'All' },
            { key: 'mine', label: 'Mine' },
            { key: 'theirs', label: 'Theirs' },
          ]}
          value={filter}
          onChange={(k) => setFilter(k as Filter)}
        />
      </View>

      {pendingCount > 0 && (
        <Pressable
          onPress={async () => {
            // Resume the OLDEST pending entry so the user sees their actual failed
            // post, not a fresh composer. If there are multiple, the others stay in
            // the queue and the banner count drops by one after this resolves.
            const queue = await diaryQueue.list();
            const oldest = queue.sort((a, b) => a.queuedAt - b.queuedAt)[0];
            if (oldest) {
              navigation.navigate('DiaryCreate', { resumeId: oldest.localId });
            } else {
              navigation.navigate('DiaryCreate');
            }
          }}
          style={[
            styles.pendingBanner,
            { backgroundColor: theme.colors.surface, borderColor: 'rgba(232,99,122,0.4)' },
          ]}
        >
          <Feather name="alert-circle" size={14} color={theme.colors.destructive} />
          <Text variant="bodySmall" style={{ marginLeft: 8, flex: 1 }}>
            {pendingCount} {pendingCount === 1 ? 'entry' : 'entries'} pending — tap to resume
          </Text>
          <Feather name="chevron-right" size={16} color={theme.colors.muted} />
        </Pressable>
      )}

      {initialLoading ? (
        <View style={{ marginTop: 32, gap: 16, paddingHorizontal: theme.screenPadding }}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="book-open"
          title="Your story starts here"
          body="Capture little moments and milestones together."
          cta={{ label: 'Write the first entry', onPress: () => navigation.navigate('DiaryCreate') }}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingTop: 16,
            paddingBottom: theme.bottomNavReserve + 16,
            gap: 16,
          }}
          renderItem={({ item }) => (
            <DiaryCard
              entry={item}
              partnerName={user?.partnerName ?? 'Partner'}
              ownAvatar={user?.avatarUrl ?? null}
              ownName={user?.name ?? 'You'}
              onPress={() => navigation.navigate('DiaryDetail', { id: item.id })}
            />
          )}
          // Infinite scroll: when within ~half a screen of the bottom, request the next page.
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator color={theme.colors.muted} />
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          // expo-image handles its own buffering; we still want React Native to keep
          // off-screen rows around for snappy scroll.
          removeClippedSubviews
        />
      )}
    </ScreenContainer>
  );
}

function DiaryCard({
  entry,
  onPress,
  partnerName,
  ownAvatar,
  ownName,
}: {
  entry: DiaryEntry;
  onPress: () => void;
  partnerName: string;
  ownAvatar: string | null;
  ownName: string;
}) {
  const theme = useTheme();
  const isYou = entry.author === 'you';
  const displayName = isYou ? ownName : entry.authorName ?? partnerName;
  // Own entries use the live user.avatarUrl from AuthContext (kept fresh via socket
  // profile_updated). Partner entries use the snapshot the backend embedded in the
  // feed payload — also a Cloudinary URL, so expo-image caches both transparently.
  const avatarUri = isYou ? ownAvatar : entry.authorAvatar ?? null;
  const isDeleted = !!entry.deletedAt;

  // The backend serializer now returns discrete `text` + `mediaUrl` fields. We fall
  // back to the legacy `content` field for any older cached entry shape.
  const textBody = entry.text ?? (entry.type === 'text' ? entry.content : null);
  const mediaUrl = entry.mediaUrl ?? (entry.type !== 'text' ? entry.content : null);
  const thumb = entry.type === 'video' ? entry.thumbnailUrl ?? videoPosterUrl(mediaUrl) : thumbUrl(mediaUrl);

  return (
    <Card padding={0} onPress={onPress}>
      <View style={{ padding: 20 }}>
        <View style={styles.row}>
          <Avatar uri={avatarUri} name={displayName} size={32} ring={isYou ? 'rose' : 'gold'} />
          <Text variant="bodySmall" weight="medium" style={{ marginLeft: 10 }}>
            {displayName}
          </Text>
          {entry.milestone && (
            <Feather name="star" size={14} color={theme.colors.accent} style={{ marginLeft: 8 }} />
          )}
          <Text variant="caption" color="muted" style={{ marginLeft: 6 }}>
            · {timeAgo(entry.timestamp)}
          </Text>
        </View>

        {isDeleted ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
            <Feather name="slash" size={14} color={theme.colors.muted} />
            <Text variant="bodySmall" color="muted" style={{ marginLeft: 8, fontStyle: 'italic' }}>
              {textBody || 'Entry was removed.'}
            </Text>
          </View>
        ) : (
          entry.type === 'text' &&
          !!textBody && (
            <Text variant="serifBody" style={{ marginTop: 12 }} numberOfLines={6}>
              {textBody}
            </Text>
          )
        )}
      </View>
      {!isDeleted && (entry.type === 'image' || entry.type === 'video') && !!thumb && (
        <View>
          <ExpoImage
            source={{ uri: thumb }}
            style={styles.image}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
          {entry.type === 'video' && (
            <View pointerEvents="none" style={styles.videoOverlay}>
              <Feather name="play-circle" size={42} color="#fff" />
            </View>
          )}
        </View>
      )}
      {!isDeleted && (
        <View style={[styles.footer, { borderTopColor: theme.colors.hairline }]}>
          <View style={styles.footerBtn}>
            <Feather
              name="heart"
              size={20}
              color={entry.userLiked || (entry.likes ?? 0) > 0 ? theme.colors.primary : theme.colors.muted}
            />
            <Text variant="caption" color="muted" style={{ marginLeft: 8 }}>
              {entry.likes ?? 0}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          <Feather name="message-circle" size={18} color={theme.colors.muted} />
          <Text variant="caption" color="muted" style={{ marginLeft: 6 }}>
            {entry.comments ?? 0}
          </Text>
          <Feather name="chevron-right" size={18} color={theme.colors.muted} style={{ marginLeft: 8 }} />
        </View>
      )}
    </Card>
  );
}

function SkeletonCard() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.skeleton,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
      ]}
    >
      <View style={[styles.skeletonRow, { backgroundColor: theme.colors.hairlineStrong, width: 120 }]} />
      <View style={[styles.skeletonRow, { backgroundColor: theme.colors.hairlineStrong, width: '90%', marginTop: 12 }]} />
      <View style={[styles.skeletonRow, { backgroundColor: theme.colors.hairlineStrong, width: '75%', marginTop: 6 }]} />
    </View>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  image: { width: '100%', aspectRatio: 1.4, maxHeight: 320 },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: { flexDirection: 'row', alignItems: 'center' },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  skeleton: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    height: 140,
  },
  skeletonRow: {
    height: 12,
    borderRadius: 6,
    opacity: 0.45,
  },
});
