import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScreenContainer, InlineHeader, Text, Button, EmptyState, GlassSurface } from '@/components';
import { useTheme } from '@/theme';
import { vaultApi } from '@/api';
import { VaultItem } from '@/types/api';
import { vaultQueue, VaultQueueEntry } from '@/services/vaultQueue';
import { vaultUploadManager, ManagerState } from '@/services/vaultUploadManager';
import { thumbUrl, fullUrl } from '@/utils/cloudinary';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLS = 3;
const TILE_GAP = 8;
const GRID_HORIZONTAL_PADDING = 16;
const TILE_SIZE =
  (Math.min(SCREEN_WIDTH, 430) - GRID_HORIZONTAL_PADDING * 2 - TILE_GAP * (NUM_COLS - 1)) / NUM_COLS;
const PAGE_SIZE = 30;

export function VaultGridScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<ManagerState>(vaultUploadManager.getState());

  // Race-protection epoch: bumped on every fresh load so stale responses can't
  // overwrite a more recent page.
  const fetchEpoch = useRef(0);
  const flatListRef = useRef<FlatList<VaultItem> | null>(null);

  // ── Subscribe to upload manager state ────────────────────────────────────────
  useEffect(() => {
    const unsub = vaultUploadManager.subscribe(setUploadState);
    // When a queued upload completes, insert the new item optimistically at the top
    // of the grid so the user sees it without waiting for the next refetch.
    vaultUploadManager.onItemCreated((item) => {
      setItems((prev) => {
        if (prev.some((p) => p.id === item.id)) return prev;
        return [item, ...prev];
      });
    });
    return () => {
      unsub();
      vaultUploadManager.onItemCreated(null);
    };
  }, []);

  // ── Stale-queue garbage collection ───────────────────────────────────────────
  // Sweep abandoned entries on every screen mount. The threshold was 24h previously
  // but that's too generous — entries older than 1h that haven't completed are
  // almost always abandoned (typical iPhone HEIC upload completes in <30s on LTE).
  // Anything older was the cause of the phantom-banner reports.
  //
  // We also drop entries with `uploadedUrl` set but no completed DB-create —
  // those were the ones triggering silent re-fires of the create endpoint on every
  // vault-open. The Cloudinary asset becomes orphaned, which is acceptable for
  // privacy (the user wanted the upload deleted anyway, conceptually) vs. the
  // confusion of repeated phantom banners.
  const STALE_QUEUE_AGE_MS = 60 * 60 * 1000;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await vaultQueue.list();
      const now = Date.now();
      const stale = entries.filter((e) => now - e.queuedAt > STALE_QUEUE_AGE_MS);
      if (cancelled || stale.length === 0) return;
      for (const entry of stale) {
        await vaultQueue.remove(entry.localId).catch(() => undefined);
      }
      if (__DEV__) console.log(`[Vault] GC removed ${stale.length} stale queue entries`);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Initial + focused loads + queue resume ───────────────────────────────────
  const reload = useCallback(async () => {
    const epoch = ++fetchEpoch.current;
    try {
      const page = await vaultApi.list({ limit: PAGE_SIZE });
      if (epoch !== fetchEpoch.current) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        await vaultApi.clearToken();
        Alert.alert('Session expired', 'Please unlock the vault again.');
        navigation.replace('VaultUnlock');
        return;
      }
      // surface via empty fallback
    } finally {
      if (epoch === fetchEpoch.current) setInitialLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      reload();
      // Resume any pending uploads left over from a previous session/kill.
      vaultUploadManager.drain();
    }, [reload])
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || !nextCursor) return;
    setLoadingMore(true);
    const epoch = fetchEpoch.current;
    try {
      const page = await vaultApi.list({ cursor: nextCursor, limit: PAGE_SIZE });
      if (epoch !== fetchEpoch.current) return;
      setItems((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...page.items.filter((p) => !ids.has(p.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        await vaultApi.clearToken();
        navigation.replace('VaultUnlock');
      }
    } finally {
      if (epoch === fetchEpoch.current) setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  // ── Pick + enqueue batch ─────────────────────────────────────────────────────
  // The system image/document picker is itself modal; iOS rejects presenting one while
  // another modal is still animating out. The reliable handoff is Modal.onDismiss
  // (fires after the dismiss animation completes), not a wall-clock setTimeout. Same
  // pattern that fixed the chat attachment sheet.
  const dismissResolvers = useRef<Array<() => void>>([]);
  const awaitSheetDismiss = useCallback(
    () =>
      new Promise<void>((resolve) => {
        dismissResolvers.current.push(resolve);
      }),
    []
  );
  const handleSheetDismiss = useCallback(() => {
    const fns = dismissResolvers.current;
    dismissResolvers.current = [];
    fns.forEach((fn) => fn());
  }, []);

  const closeSheetThen = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setShowUploadSheet(false);
    if (Platform.OS === 'ios') {
      await awaitSheetDismiss();
    } else {
      // Android dismisses synchronously; a single frame is enough.
      await new Promise((r) => setTimeout(r, 50));
    }
    try {
      return await fn();
    } catch (e: any) {
      Alert.alert('Could not open picker', e?.message ?? 'Try again.');
    }
    return undefined;
  };

  const enqueueAssets = async (
    assets: ImagePicker.ImagePickerAsset[],
    fileType: 'image' | 'video'
  ) => {
    if (assets.length === 0) return;
    const now = Date.now();
    const entries: VaultQueueEntry[] = assets.map((a, idx) => ({
      localId: `vlocal-${now}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      mediaUri: a.uri,
      mediaMime: a.mimeType ?? (fileType === 'image' ? 'image/jpeg' : 'video/mp4'),
      fileType,
      uploadedUrl: null,
      uploadedThumbnailUrl: null,
      retries: 0,
      lastError: null,
      queuedAt: Date.now(),
    }));
    await vaultQueue.enqueueMany(entries);
    // Flag these as user-initiated so the foreground "Uploading…" banner shows for
    // them. Entries auto-resumed from disk (no picker tap this session) are NOT
    // flagged and upload silently — that's the whole reason this distinction exists.
    vaultUploadManager.markSessionInitiated(entries.map((e) => e.localId));
    vaultUploadManager.drain();
  };

  const pickPhotos = (source: 'camera' | 'library') =>
    closeSheetThen(async () => {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new Error(`${source} permission was denied.`);

      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
        // Multi-select only makes sense on library; camera is one shot per launch.
        allowsMultipleSelection: source === 'library',
        selectionLimit: source === 'library' ? 50 : 1,
      };
      const r =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
      if (r.canceled || !r.assets?.length) return;
      await enqueueAssets(r.assets, 'image');
    });

  const pickVideos = () =>
    closeSheetThen(async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new Error('Photo library permission was denied.');
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: 10,
      });
      if (r.canceled || !r.assets?.length) return;
      await enqueueAssets(r.assets, 'video');
    });

  const recordVideo = () =>
    closeSheetThen(async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) throw new Error('Camera permission was denied.');
      const r = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        quality: 0.7,
      });
      if (r.canceled || !r.assets?.length) return;
      await enqueueAssets(r.assets, 'video');
    });

  // ── Delete (with confirmation) ───────────────────────────────────────────────
  const confirmDelete = (item: VaultItem, onDeleted: () => void) => {
    Alert.alert(
      'Remove this memory?',
      'It will be permanently deleted from the vault and cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await vaultApi.remove(item.id);
              setItems((prev) => prev.filter((p) => p.id !== item.id));
              onDeleted();
            } catch (e: any) {
              Alert.alert('Could not delete', e?.response?.data?.error ?? e?.message ?? 'Try again.');
            }
          },
        },
      ]
    );
  };

  const lockNow = async () => {
    await vaultApi.clearToken();
    navigation.replace('VaultUnlock');
  };

  // ── Render helpers ───────────────────────────────────────────────────────────
  const renderTile = useCallback(
    ({ item, index }: { item: VaultItem; index: number }) => {
      const thumb = thumbUrl(item.thumbnailUrl ?? item.url, TILE_SIZE) ?? item.thumbnailUrl ?? item.url;
      return (
        <Pressable onPress={() => setPreviewIdx(index)}>
          <View
            style={[
              styles.tile,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.hairline,
                marginLeft: index % NUM_COLS === 0 ? 0 : TILE_GAP,
              },
            ]}
          >
            <ExpoImage
              source={{ uri: thumb }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
            />
            {item.type === 'video' && (
              <View style={styles.videoBadge}>
                <Feather name="play" size={12} color="#fff" />
              </View>
            )}
          </View>
        </Pressable>
      );
    },
    [theme.colors.surface, theme.colors.hairline]
  );

  // Fixed-size tiles → getItemLayout is a massive perf win for FlatList at 100+ items.
  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: TILE_SIZE,
      offset: (TILE_SIZE + TILE_GAP) * Math.floor(index / NUM_COLS),
      index,
    }),
    []
  );

  const aggregateProgress = useMemo(() => {
    const entryStates = Object.values(uploadState.entries);
    if (entryStates.length === 0) return { active: 0, label: '' };
    // Two-condition filter:
    //   1. status === 'uploading' — real byte transfer in flight (excludes the
    //      sub-second 'creating' DB-write phase which used to flash a 100% banner)
    //   2. userInitiated === true — entry was just picked in this session, not
    //      auto-resumed from a stale disk queue. Resumed entries upload silently
    //      so the user never sees "phantom" progress for work they didn't start.
    const inflight = entryStates.filter(
      (e) => e.status === 'uploading' && e.userInitiated === true
    );
    if (inflight.length === 0) return { active: 0, label: '' };
    // Cap the displayed progress at 99% to avoid the brief "100%" frame that lands
    // between the last byte sent and status flipping to 'creating'.
    const avgProgress = Math.min(
      0.99,
      inflight.reduce((s, e) => s + (e.progress ?? 0), 0) / inflight.length
    );
    return {
      active: inflight.length,
      label: `${uploadState.completed} of ${inflight.length + uploadState.completed} · ${Math.round(
        avgProgress * 100
      )}%`,
    };
  }, [uploadState]);

  return (
    <ScreenContainer scroll={false} glowCorner="none" edges={['top', 'bottom']}>
      <InlineHeader
        title="Vault"
        rightActions={[
          { icon: 'lock', onPress: lockNow },
          { icon: 'plus', onPress: () => setShowUploadSheet(true) },
        ]}
      />
      {/* Header status row — count on the left, lock badge on the right. Both lines
          read as one cohesive sub-title for the screen. When an upload is in flight
          the count line is replaced by the progress label below, so the eye doesn't
          have to track two pieces of state simultaneously. */}
      <View
        style={[
          styles.headerStatus,
          {
            paddingHorizontal: theme.screenPadding,
            borderBottomColor: theme.colors.hairline,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Feather name="shield" size={12} color={theme.colors.muted} />
          <Text variant="caption" color="muted" style={{ marginLeft: 6 }}>
            {items.length} {items.length === 1 ? 'memory' : 'memories'} · end-to-end private
          </Text>
        </View>
      </View>

      {/* Aggregate upload progress banner */}
      {aggregateProgress.active > 0 && (
        <View
          style={[
            styles.uploadingBar,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
          ]}
        >
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text variant="bodySmall" style={{ marginLeft: 10, flex: 1 }} numberOfLines={1}>
            Uploading {aggregateProgress.label}
          </Text>
          <Pressable onPress={() => vaultUploadManager.cancelAll()} hitSlop={8}>
            <Text variant="bodySmall" color="destructive" weight="semibold">
              Cancel
            </Text>
          </Pressable>
        </View>
      )}

      {/* Vault token expired mid-batch — worker paused, user must re-unlock to resume */}
      {uploadState.needsUnlock && (
        <Pressable
          onPress={() => navigation.replace('VaultUnlock')}
          style={[
            styles.uploadingBar,
            { backgroundColor: theme.colors.surface, borderColor: 'rgba(232,99,122,0.4)' },
          ]}
        >
          <Feather name="lock" size={14} color={theme.colors.destructive} />
          <Text variant="bodySmall" style={{ marginLeft: 10, flex: 1 }}>
            Vault locked mid-upload — tap to re-unlock and resume
          </Text>
          <Feather name="chevron-right" size={16} color={theme.colors.muted} />
        </Pressable>
      )}

      {/* Permanent-failure banner. The user can retry all (one more attempt per
          failed entry) or dismiss to clear the queue and reset the failure count —
          dismissal asks for confirmation since it's destructive (the local file
          references are dropped; user has to re-pick from the picker to upload
          again). The × icon is the explicit dismiss affordance — previously this
          banner had only "Retry all" with no way to close it, leaving users stuck
          when the underlying error wasn't recoverable. */}
      {uploadState.failed > 0 && (
        <View
          style={[
            styles.uploadingBar,
            { backgroundColor: theme.colors.surface, borderColor: 'rgba(232,99,122,0.4)' },
          ]}
        >
          <Feather name="alert-circle" size={14} color={theme.colors.destructive} />
          <Text variant="bodySmall" style={{ marginLeft: 10, flex: 1 }} numberOfLines={1}>
            {uploadState.failed} {uploadState.failed === 1 ? 'upload' : 'uploads'} failed
          </Text>
          <Pressable
            onPress={async () => {
              const queue = await vaultQueue.list();
              for (const entry of queue) {
                if (entry.retries >= vaultQueue.MAX_RETRIES) {
                  await vaultUploadManager.retry(entry.localId);
                }
              }
            }}
            hitSlop={8}
            style={{ marginRight: 12 }}
          >
            <Text variant="bodySmall" color="primary" weight="semibold">
              Retry all
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Alert.alert(
                'Dismiss failed uploads?',
                "We'll clear them from the queue. You can re-pick them from your library to try again.",
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Dismiss',
                    style: 'destructive',
                    onPress: () => {
                      void vaultUploadManager.discardAllFailed();
                    },
                  },
                ]
              );
            }}
            hitSlop={8}
            style={[styles.dismissBtn, { borderColor: theme.colors.hairlineStrong }]}
          >
            <Feather name="x" size={14} color={theme.colors.muted} />
          </Pressable>
        </View>
      )}

      {initialLoading ? (
        <View style={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.tile,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.hairline,
                  opacity: 0.4,
                },
              ]}
            />
          ))}
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon="lock"
          title="Your private space is empty"
          body="Add a moment that's just for the two of you."
          cta={{ label: 'Add your first memory', onPress: () => setShowUploadSheet(true) }}
        />
      ) : (
        <FlatList
          ref={flatListRef}
          data={items}
          keyExtractor={(i) => i.id}
          numColumns={NUM_COLS}
          contentContainerStyle={{
            paddingHorizontal: GRID_HORIZONTAL_PADDING,
            paddingTop: 16,
            paddingBottom: theme.bottomNavReserve + 16,
          }}
          columnWrapperStyle={{ gap: TILE_GAP }}
          ItemSeparatorComponent={() => <View style={{ height: TILE_GAP }} />}
          renderItem={renderTile}
          // Fixed-size tiles let the list virtualize aggressively at large library sizes.
          getItemLayout={getItemLayout}
          // Pull more from the server when within ~half a screen of the bottom.
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator color={theme.colors.muted} />
              </View>
            ) : null
          }
          onRefresh={onRefresh}
          refreshing={refreshing}
          removeClippedSubviews
          windowSize={6}
          initialNumToRender={NUM_COLS * 5}
        />
      )}

      {/* Upload sheet */}
      <Modal
        visible={showUploadSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUploadSheet(false)}
        onDismiss={Platform.OS === 'ios' ? handleSheetDismiss : undefined}
      >
        <Pressable style={styles.scrim} onPress={() => setShowUploadSheet(false)}>
          <Pressable onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.handle, { backgroundColor: theme.colors.hairlineStrong }]} />
            <Text variant="h3" align="center" style={{ marginTop: 16, marginBottom: 16 }}>
              Add memories
            </Text>
            <Button label="Take a photo" leadingIcon="camera" fullWidth onPress={() => pickPhotos('camera')} />
            <Button
              label="Choose photos from library"
              leadingIcon="image"
              variant="secondary"
              style={{ marginTop: 12 }}
              fullWidth
              onPress={() => pickPhotos('library')}
            />
            <Button
              label="Record a video"
              leadingIcon="video"
              variant="secondary"
              style={{ marginTop: 12 }}
              fullWidth
              onPress={recordVideo}
            />
            <Button
              label="Choose videos from library"
              leadingIcon="film"
              variant="secondary"
              style={{ marginTop: 12 }}
              fullWidth
              onPress={pickVideos}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Swipeable lightbox */}
      {previewIdx !== null && items[previewIdx] && (
        <Lightbox
          items={items}
          initialIndex={previewIdx}
          onClose={() => setPreviewIdx(null)}
          onIndexChange={setPreviewIdx}
          onDelete={(item) =>
            confirmDelete(item, () => {
              // Close the lightbox if we deleted the last item; otherwise stay on the
              // same index (which is now the next item).
              setPreviewIdx((idx) => {
                if (idx === null) return null;
                const newLen = items.length - 1;
                if (newLen === 0) return null;
                return Math.min(idx, newLen - 1);
              });
            })
          }
        />
      )}
    </ScreenContainer>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Lightbox — horizontal FlatList with paging, full-resolution media + video player.
// Kept in this file (not extracted) to keep the vault feature self-contained while
// still <500 lines per file.
// ──────────────────────────────────────────────────────────────────────────────
function Lightbox({
  items,
  initialIndex,
  onClose,
  onIndexChange,
  onDelete,
}: {
  items: VaultItem[];
  initialIndex: number;
  onClose: () => void;
  onIndexChange: (idx: number) => void;
  onDelete: (item: VaultItem) => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(initialIndex);
  const listRef = useRef<FlatList<VaultItem> | null>(null);

  useEffect(() => {
    onIndexChange(currentIdx);
  }, [currentIdx, onIndexChange]);

  // Scroll to the initial item on mount. FlatList's `initialScrollIndex` would do
  // this for us, but only if every item has a fixed size — videos vs images differ
  // visually but pageSize is the screen width, so we set it manually.
  useEffect(() => {
    if (initialIndex > 0) {
      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: initialIndex * SCREEN_WIDTH, animated: false });
      }, 50);
    }
  }, [initialIndex]);

  const currentItem = items[currentIdx];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.lightbox}>
        <View style={styles.lightboxTop}>
          <Pressable onPress={onClose} style={styles.lightboxBtn}>
            <Feather name="x" size={22} color="#fff" />
          </Pressable>
          <Text variant="bodySmall" style={{ color: '#fff' }}>
            {currentIdx + 1} / {items.length}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(i) => i.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setCurrentIdx(idx);
          }}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          renderItem={({ item }) => (
            <View style={{ width: SCREEN_WIDTH }}>
              {item.type === 'video' ? (
                <Video
                  source={{ uri: item.url }}
                  style={styles.lightboxImage}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  usePoster
                  posterSource={item.thumbnailUrl ? { uri: item.thumbnailUrl } : undefined}
                />
              ) : (
                <ExpoImage
                  source={{ uri: fullUrl(item.url) ?? item.url }}
                  style={styles.lightboxImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              )}
            </View>
          )}
        />

        <GlassSurface radius={28} style={styles.lightboxBar}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', padding: 12 }}>
            <Pressable style={styles.lightboxAction} hitSlop={8}>
              <Feather name="info" size={20} color="#fff" />
            </Pressable>
            <Pressable
              style={styles.lightboxAction}
              hitSlop={8}
              onPress={() => currentItem && onDelete(currentItem)}
            >
              <Feather name="trash-2" size={20} color="#E8637A" />
            </Pressable>
          </View>
        </GlassSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerStatus: {
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  videoBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    padding: 24,
    paddingBottom: 32,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  lightbox: { flex: 1, backgroundColor: '#000' },
  lightboxTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  lightboxBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  lightboxImage: { flex: 1, width: SCREEN_WIDTH },
  lightboxBar: { margin: 16, marginBottom: 32 },
  lightboxAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dismissBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
