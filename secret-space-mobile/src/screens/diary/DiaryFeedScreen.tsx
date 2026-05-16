import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, StyleSheet, View, FlatList } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScreenContainer, Text, Card, Avatar, EmptyState, SegmentedControl } from '@/components';
import { useTheme } from '@/theme';
import { diaryApi } from '@/api';
import { DiaryEntry } from '@/types/api';
import { useAuth } from '@/context/AuthContext';

type Filter = 'all' | 'mine' | 'theirs';

export function DiaryFeedScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const list = await diaryApi.list();
      setEntries(list);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Re-fetch whenever the user returns to this tab (e.g., after liking/commenting from detail).
  useFocusEffect(
    useCallback(() => {
      fetch();
    }, [fetch])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  };

  // Backend returns `author: 'you' | 'partner'`. Filter client-side.
  const filtered = entries.filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'mine') return e.author === 'you';
    return e.author === 'partner';
  });

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
          onChange={setFilter}
        />
      </View>

      {filtered.length === 0 ? (
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
              onPress={() => navigation.navigate('DiaryDetail', { id: item.id })}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </ScreenContainer>
  );
}

function DiaryCard({
  entry,
  onPress,
  partnerName,
}: {
  entry: DiaryEntry;
  onPress: () => void;
  partnerName: string;
}) {
  const theme = useTheme();
  const isYou = entry.author === 'you';
  const displayName = isYou ? 'You' : partnerName;
  const isDeleted = !!entry.deletedAt;

  return (
    <Card padding={0} onPress={onPress}>
      <View style={{ padding: 20 }}>
        <View style={styles.row}>
          <Avatar name={displayName} size={32} ring={isYou ? 'rose' : 'gold'} />
          <Text variant="bodySmall" weight="medium" style={{ marginLeft: 10 }}>
            {displayName}
          </Text>
          <Text variant="caption" color="muted" style={{ marginLeft: 6 }}>
            · {timeAgo(entry.timestamp)}
          </Text>
        </View>

        {isDeleted ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
            <Feather name="slash" size={14} color={theme.colors.muted} />
            <Text variant="bodySmall" color="muted" style={{ marginLeft: 8, fontStyle: 'italic' }}>
              {entry.content || 'Entry was removed.'}
            </Text>
          </View>
        ) : (
          entry.type === 'text' && (
            <Text variant="serifBody" style={{ marginTop: 12 }} numberOfLines={6}>
              {entry.content}
            </Text>
          )
        )}
      </View>
      {!isDeleted && entry.type === 'image' && !!entry.content && (
        <Image source={{ uri: entry.content }} style={styles.image} resizeMode="cover" />
      )}
      {!isDeleted && (
        <View style={[styles.footer, { borderTopColor: theme.colors.hairline }]}>
          <View style={styles.footerBtn}>
            <Feather
              name="heart"
              size={20}
              color={entry.likes > 0 ? theme.colors.primary : theme.colors.muted}
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: { flexDirection: 'row', alignItems: 'center' },
});
