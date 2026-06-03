import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScreenContainer, InlineHeader, Text, EmptyState, SegmentedControl, Avatar, Chip } from '@/components';
import { useTheme } from '@/theme';
import { couponsApi } from '@/api';
import { Coupon, CouponStatus } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { useChatSocket } from '@/context/ChatSocketContext';

type Tab = 'received' | 'given' | 'fulfill';

export function CouponsListScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { subscribeCoupons } = useChatSocket();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [tab, setTab] = useState<Tab>('received');
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    try {
      setCoupons(await couponsApi.list());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Refresh when returning from create/detail or switching back to this tab.
  useFocusEffect(
    useCallback(() => {
      fetch();
    }, [fetch])
  );

  // Realtime: when the partner creates/redeems/approves/fulfills a coupon, refetch so
  // both sides see the up-to-date status without manual pull-to-refresh.
  useEffect(() => {
    const unsub = subscribeCoupons(() => {
      fetch();
    });
    return unsub;
  }, [subscribeCoupons, fetch]);

  const filtered = useMemo(() => {
    if (tab === 'received') return coupons.filter((c) => c.recipient === 'you');
    if (tab === 'given') return coupons.filter((c) => c.creator === 'you');
    return coupons.filter((c) => c.status === 'Pending' && c.creator === 'you');
  }, [coupons, tab]);

  // Count, not boolean — a numeric pill ("To Fulfill 3") gives more signal
  // than a binary dot. Mirrors the chat unread-count pattern in TopBar.
  const pendingFulfillCount = coupons.filter(
    (c) => c.status === 'Pending' && c.creator === 'you'
  ).length;

  return (
    <ScreenContainer scroll={false}>
      {/* Migrated from a bespoke <View> header to the standardized InlineHeader
          pattern shared with Diary, LoveBot, Vault, and Home — one component,
          one rhythm, one height across every tab landing screen. */}
      <InlineHeader
        title="Coupons"
        rightActions={[
          { icon: 'plus', kind: 'cta', onPress: () => navigation.navigate('CouponCreate') },
        ]}
      />

      <View style={{ paddingHorizontal: theme.screenPadding, marginTop: 8 }}>
        <SegmentedControl
          segments={[
            { key: 'received', label: 'Received' },
            { key: 'given', label: 'Given' },
            { key: 'fulfill', label: 'To Fulfill', badge: pendingFulfillCount },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon="tag"
          title={
            tab === 'fulfill'
              ? 'Nothing to fulfill right now.'
              : tab === 'received'
                ? 'No coupons from them yet.'
                : "You haven't made any coupons."
          }
          body={
            tab === 'fulfill'
              ? "Coupons they've redeemed will land here when they do."
              : tab === 'received'
                ? "Promises they make for you will show up here."
                : 'Make one when you feel like it.'
          }
          cta={tab !== 'fulfill' ? { label: 'Make one', onPress: () => navigation.navigate('CouponCreate') } : undefined}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingTop: 16,
            paddingBottom: theme.bottomNavReserve + 16,
            gap: 16,
          }}
          renderItem={({ item }) => (
            <CouponCard coupon={item} onPress={() => navigation.navigate('CouponDetail', { id: item.id })} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await fetch();
                setRefreshing(false);
              }}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}
    </ScreenContainer>
  );
}

export function CouponCard({ coupon, onPress }: { coupon: Coupon; onPress: () => void }) {
  const theme = useTheme();
  const { user } = useAuth();
  const statusToTone: Record<CouponStatus, 'sage' | 'gold' | 'muted' | 'rose'> = {
    Active: 'sage',
    Pending: 'gold',
    Used: 'rose',
    Fulfilled: 'muted',
    Expired: 'rose',
  };
  const redeemed = coupon.status === 'Used' || coupon.status === 'Fulfilled';

  return (
    <Pressable onPress={onPress}>
      <View
        style={[
          styles.coupon,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
          theme.shadows.card,
        ]}
      >
        <LinearGradient
          colors={['rgba(232,99,122,0.08)', 'rgba(201,169,110,0.05)', 'transparent']}
          style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
        />
        {/* Notches */}
        <View style={[styles.notch, styles.notchLeft, { backgroundColor: theme.colors.background }]} />
        <View style={[styles.notch, styles.notchRight, { backgroundColor: theme.colors.background }]} />

        <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              {/* Title now wraps to up to 2 lines — the old single-line cap
                  ellipsized longer titles like "A whole evening, phones off"
                  mid-word. Font drops 22→20 so a 2-line title still fits the
                  card height comfortably; lineHeight tightens to 26 for a
                  hand-set feel rather than the loose 30 of the h3 default. */}
              <Text
                variant="h3"
                style={{ fontSize: 20, lineHeight: 26 }}
                numberOfLines={2}
              >
                {coupon.title}
              </Text>
              <Text variant="bodySmall" color="muted" style={{ marginTop: 6 }} numberOfLines={2}>
                {coupon.description}
              </Text>
            </View>
            {/* Status chip stays top-right. alignSelf pins it to the first
                line of the title so a 2-line title doesn't push it down — the
                chip anchors visually to the top edge of the card content. */}
            <View style={{ flexShrink: 0, alignSelf: 'flex-start' }}>
              <Chip label={coupon.status} tone={statusToTone[coupon.status]} size="sm" />
            </View>
          </View>
        </View>

        <View style={[styles.dashRow, { paddingHorizontal: 28 }]}>
          {Array.from({ length: 24 }).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 1, backgroundColor: i % 2 === 0 ? theme.colors.hairlineStrong : 'transparent' }} />
          ))}
        </View>

        {/* Two-region footer: identity on the left (avatar + name), metadata on the
            right (expiry chip). The name truncates with ellipsis if it's long; the
            chip has `flexShrink: 0` so the date is never cut off. */}
        <View style={[styles.couponFooter, { paddingHorizontal: 20 }]}>
          <View style={styles.couponFooterIdentity}>
            <Avatar
              uri={
                coupon.creator === 'you'
                  ? user?.avatarUrl ?? null
                  : user?.partnerAvatar ?? null
              }
              name={coupon.creator === 'you' ? user?.name ?? 'You' : user?.partnerName ?? 'Partner'}
              size={24}
              ring={coupon.creator === 'you' ? 'rose' : 'gold'}
            />
            <Text
              variant="caption"
              color="muted"
              numberOfLines={1}
              style={{ marginLeft: 8, flex: 1 }}
            >
              From {coupon.creator === 'you' ? 'you' : user?.partnerName ?? 'partner'}
            </Text>
          </View>
          {coupon.expiry && (
            <View style={{ flexShrink: 0, marginLeft: 8 }}>
              <Chip
                label={`Expires ${new Date(coupon.expiry).toLocaleDateString()}`}
                tone="muted"
                size="sm"
              />
            </View>
          )}
        </View>

        {redeemed && (
          <View style={styles.stamp} pointerEvents="none">
            <View
              style={[
                styles.stampPill,
                {
                  borderColor: 'rgba(232,99,122,0.55)',
                  backgroundColor: 'rgba(232,99,122,0.10)',
                },
              ]}
            >
              <Text style={[styles.stampText, { color: 'rgba(232,99,122,0.85)' }]}>
                REDEEMED
              </Text>
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  coupon: {
    borderRadius: 20,
    paddingBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
  },
  notch: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    top: '50%',
    marginTop: -10,
  },
  notchLeft: { left: -10 },
  notchRight: { right: -10 },
  dashRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 4 },
  couponFooter: { flexDirection: 'row', alignItems: 'center' },
  // The identity sub-row gets flex:1 so its name can truncate while the expiry chip
  // (in a flexShrink:0 sibling) stays at its natural width on the right.
  couponFooterIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  // The old stamp was a giant diagonal banner across the whole card — over-
  // designed and clashed with the title/description. Now a compact angled pill
  // pinned to the bottom-right corner; reads clearly without dominating.
  stamp: {
    position: 'absolute',
    bottom: 10,
    right: 14,
    transform: [{ rotate: '-8deg' }],
  },
  stampPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  stampText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
