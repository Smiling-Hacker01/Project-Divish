import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, TopBar, Text, Card, Button, Input, toast } from '@/components';
import { useTheme } from '@/theme';
import { couponsApi } from '@/api';
import { Coupon, CouponStatus } from '@/types/api';
import { RootStackParamList } from '@/navigation/types';
import { useChatSocket } from '@/context/ChatSocketContext';
import { useAuth } from '@/context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'CouponDetail'>;

// Pretty relative-time formatter — "3 days ago" reads warmer than a date row
// on intimate content. Same helper shape as DiaryFeedScreen.timeAgo but with a
// slightly more verbose unit-words to suit the slower-paced coupon detail
// screen rather than the fast diary feed.
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} ${m === 1 ? 'minute' : 'minutes'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ${d === 1 ? 'day' : 'days'} ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} ${w === 1 ? 'week' : 'weeks'} ago`;
  const months = Math.floor(d / 30);
  if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  const years = Math.floor(d / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

// Status → human-readable subtitle shown above the lifecycle timeline. The
// timeline itself is always visible (forward-looking for Active, completed
// for Fulfilled), so the subtitle gives a one-line read of "where we are".
const statusSubtitle: Record<CouponStatus, string> = {
  Active: 'Waiting to be redeemed',
  Pending: 'Redemption requested',
  Used: 'Approved — awaiting fulfillment',
  Fulfilled: 'Complete',
  Expired: 'Expired without redemption',
};

// Maps the coupon's CouponStatus to the highest completed lifecycle step
// (0=Requested, 1=Approved, 2=Fulfilled). Active = -1 means nothing started
// yet — all dots inactive, but the timeline is still visible as a preview.
const statusToStep: Record<CouponStatus, number> = {
  Active: -1,
  Pending: 0,
  Used: 1,
  Fulfilled: 2,
  Expired: -1,
};

const statusAccent: Record<CouponStatus, 'sage' | 'gold' | 'rose' | 'muted'> = {
  Active: 'sage',
  Pending: 'gold',
  Used: 'rose',
  Fulfilled: 'muted',
  Expired: 'muted',
};

export function CouponDetailScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const { subscribeCoupons } = useChatSocket();
  const { user } = useAuth();
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);

  useEffect(() => {
    couponsApi.get(route.params.id).then(setCoupon).catch(() => {});
  }, [route.params.id]);

  const refresh = useCallback(async () => {
    try {
      setCoupon(await couponsApi.get(route.params.id));
    } catch (e: any) {
      // 404 here means the coupon was deleted (either by us on this device or
      // by us on another device synced via socket). Navigate back so the user
      // isn't stuck on a stale page that can never reload.
      if (e?.response?.status === 404) {
        navigation.goBack();
      }
    }
  }, [route.params.id, navigation]);

  // Realtime: refetch when ANY coupon lifecycle event fires for this coupon —
  // status changes, edits, and deletions all funnel through here.
  useEffect(() => {
    const unsub = subscribeCoupons((evt) => {
      if (evt.couponId !== route.params.id) return;
      if (evt.action === 'deleted') {
        navigation.goBack();
        return;
      }
      refresh();
    });
    return unsub;
  }, [subscribeCoupons, route.params.id, refresh, navigation]);

  if (!coupon)
    return (
      <ScreenContainer>
        <TopBar title="" variant="floating" />
      </ScreenContainer>
    );

  // ── Lifecycle helpers ──────────────────────────────────────────────────────
  const redeem = async () => {
    try {
      await couponsApi.setStatus(coupon.id, 'pending');
      await refresh();
    } catch (e: any) {
      console.warn('[Coupon redeem] failed', e?.response?.data ?? e?.message);
    }
  };

  const approve = async () => {
    try {
      await couponsApi.setStatus(coupon.id, 'used');
      await refresh();
    } catch (e: any) {
      console.warn('[Coupon approve] failed', e?.response?.data ?? e?.message);
    }
  };

  const markFulfilled = async () => {
    try {
      await couponsApi.fulfill(coupon.id);
      await refresh();
    } catch (e: any) {
      console.warn('[Coupon fulfill] failed', e?.response?.data ?? e?.message);
    }
  };

  const review = async () => {
    if (!rating) return;
    try {
      await couponsApi.review(coupon.id, rating, reviewText);
      await refresh();
    } catch (e: any) {
      console.warn('[Coupon review] failed', e?.response?.data ?? e?.message);
    }
  };

  // ── Edit / Delete (creator-only, status-gated) ─────────────────────────────
  // Both actions are surfaced via the three-dot action sheet. Backend enforces
  // the same gates server-side so the UI hide here is purely UX courtesy —
  // hides options that would 400 anyway.
  const canEdit = coupon.creator === 'you' && coupon.status === 'Active';
  const canDelete =
    coupon.creator === 'you' && (coupon.status === 'Active' || coupon.status === 'Expired');
  const hasAnyAction = canEdit || canDelete;

  const onEdit = () => {
    setActionsOpen(false);
    navigation.navigate('CouponCreate', { couponId: coupon.id });
  };

  const onDelete = () => {
    setActionsOpen(false);
    Alert.alert(
      'Remove this coupon?',
      'It will be permanently deleted and your partner won’t see it any longer.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await couponsApi.remove(coupon.id);
              toast.success('Coupon removed.');
              navigation.goBack();
            } catch (e: any) {
              toast.error(e?.response?.data?.error ?? 'Could not delete this coupon.');
            }
          },
        },
      ]
    );
  };

  const partnerName = user?.partnerName ?? 'partner';
  const issuerName = coupon.creator === 'you' ? 'you' : partnerName;
  const recipientName = coupon.recipient === 'you' ? 'you' : partnerName;

  return (
    <ScreenContainer scroll>
      {/* Floating variant: transparent background, no bottom hairline. The
          hero card immediately below owns the visual page identity, so a
          chrome title ("Coupon") would just compete with it. Back + ⋮ at
          the corners is sufficient navigation — the page IS the coupon. */}
      <TopBar
        variant="floating"
        rightActions={
          hasAnyAction
            ? [{ icon: 'more-horizontal', onPress: () => setActionsOpen(true) }]
            : []
        }
      />
      {/* paddingTop separates the hero card from the floating back / overflow
          controls above it — at 8dp the card crowded the chrome; 20dp gives a
          clear gap so the controls and the card don't visually compete, using
          some of the empty space lower on the screen. Header stays compact. */}
      <View style={{ paddingHorizontal: theme.screenPadding, paddingTop: 20, paddingBottom: 32 }}>
        {/* Dedicated hero — replaces the reused CouponCard. Title can wrap to
            as many lines as the content needs, description is full-bleed (no
            numberOfLines cap), and the status overline sits cleanly above so
            it doesn't compete with the title for room. */}
        <View
          style={[
            styles.hero,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
            theme.shadows.card,
          ]}
        >
          <LinearGradient
            colors={['rgba(232,99,122,0.08)', 'rgba(201,169,110,0.05)', 'transparent']}
            style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
          />
          <StatusOverline status={coupon.status} accent={statusAccent[coupon.status]} />
          <Text variant="h2" style={styles.heroTitle}>
            {coupon.title}
          </Text>
          {coupon.description.length > 0 && (
            <Text
              variant="serifBody"
              color="foregroundDim"
              style={styles.heroDescription}
            >
              {coupon.description}
            </Text>
          )}
          <View style={[styles.dashRow, { paddingHorizontal: 4 }]}>
            {Array.from({ length: 24 }).map((_, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 1,
                  backgroundColor: i % 2 === 0 ? theme.colors.hairlineStrong : 'transparent',
                }}
              />
            ))}
          </View>
          <View style={styles.heroFooter}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="caption" color="muted" numberOfLines={1}>
                From {issuerName} · for {recipientName}
              </Text>
              <Text variant="caption" color="muted" style={{ marginTop: 2 }} numberOfLines={1}>
                Created {timeAgo(coupon.createdAt)}
              </Text>
            </View>
            {coupon.expiry && (
              <View style={{ marginLeft: 12, alignItems: 'flex-end' }}>
                <Text variant="caption" color="muted">
                  Expires
                </Text>
                <Text variant="bodySmall" weight="medium" style={{ marginTop: 2 }}>
                  {new Date(coupon.expiry).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Lifecycle timeline — now ALWAYS visible regardless of status. For
            Active coupons it reads forward ("here's what happens"); for later
            statuses it reads as progress through the lifecycle. */}
        <LifecycleTimeline coupon={coupon} />

        {/* Primary action button per state — these were already wired and
            stay unchanged. Only the surrounding visualization grew. */}
        {coupon.recipient === 'you' && coupon.status === 'Active' && (
          <Button
            label="Redeem this coupon"
            fullWidth
            style={{ marginTop: 20 }}
            onPress={redeem}
            leadingIcon="check-circle"
          />
        )}

        {coupon.status === 'Pending' && coupon.creator === 'you' && (
          <Button
            label="Approve redemption"
            fullWidth
            style={{ marginTop: 20 }}
            onPress={approve}
            leadingIcon="thumbs-up"
          />
        )}

        {coupon.status === 'Used' && coupon.creator === 'you' && (
          <Button
            label="Mark as fulfilled"
            fullWidth
            style={{ marginTop: 20 }}
            onPress={markFulfilled}
            leadingIcon="check"
          />
        )}

        {coupon.status === 'Fulfilled' && (() => {
          const reviewSubmitted = coupon.reviewRating !== null && coupon.reviewRating !== undefined;
          const isRecipient = coupon.recipient === 'you';
          const ratingValue = coupon.reviewRating ?? 0;

          if (reviewSubmitted) {
            return (
              <Card style={{ marginTop: 24 }}>
                <Text variant="overline" color="muted">
                  {isRecipient ? 'Your review' : 'Their review'}
                </Text>
                <View style={{ flexDirection: 'row', marginTop: 12, gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Feather
                      key={n}
                      name="star"
                      size={22}
                      color={ratingValue >= n ? theme.colors.accent : theme.colors.muted}
                    />
                  ))}
                </View>
                {coupon.reviewText && coupon.reviewText.length > 0 && (
                  <Text variant="serifQuote" style={{ fontSize: 16, marginTop: 12 }} italic>
                    “{coupon.reviewText}”
                  </Text>
                )}
                {coupon.reviewedAt && (
                  <Text variant="caption" color="muted" style={{ marginTop: 10 }}>
                    {timeAgo(coupon.reviewedAt)}
                  </Text>
                )}
              </Card>
            );
          }

          if (!isRecipient) {
            return (
              <Card variant="glass" style={{ marginTop: 24 }}>
                <Text variant="overline" color="muted">
                  Their review
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                  <Feather name="clock" size={14} color={theme.colors.muted} />
                  <Text variant="bodySmall" color="muted" style={{ marginLeft: 8 }}>
                    Waiting for their note…
                  </Text>
                </View>
              </Card>
            );
          }

          return (
            <Card style={{ marginTop: 24 }}>
              <Text variant="overline" color="muted">
                Rate this experience
              </Text>
              <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
                    <Feather
                      name="star"
                      size={28}
                      color={rating >= n ? theme.colors.accent : theme.colors.muted}
                    />
                  </Pressable>
                ))}
              </View>
              <View style={{ marginTop: 16 }}>
                <Input
                  label="Leave a sweet note (optional)"
                  value={reviewText}
                  onChangeText={setReviewText}
                  multiline
                  rows={3}
                />
              </View>
              <Button
                label="Save review"
                style={{ marginTop: 16 }}
                fullWidth
                onPress={review}
                disabled={!rating}
              />
              <Text
                variant="caption"
                color="muted"
                style={{ marginTop: 8, textAlign: 'center' }}
              >
                You can only submit a review once.
              </Text>
            </Card>
          );
        })()}
      </View>

      {/* Action sheet — Edit + Delete. Both are creator-only and status-gated
          (see canEdit / canDelete above). The whole TopBar action only renders
          when at least one is available, so this Modal never shows in an
          "empty" state. */}
      <Modal
        visible={actionsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setActionsOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setActionsOpen(false)}>
          <Pressable
            onPress={() => {}}
            style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
          >
            <View style={[styles.handle, { backgroundColor: theme.colors.hairlineStrong }]} />
            <Text variant="h3" align="center" style={{ marginTop: 16, marginBottom: 4 }}>
              Coupon options
            </Text>
            <Text variant="bodySmall" color="muted" align="center" style={{ marginBottom: 20 }}>
              What would you like to do?
            </Text>
            {canEdit && (
              <Button
                label="Edit coupon"
                leadingIcon="edit-2"
                variant="secondary"
                fullWidth
                onPress={onEdit}
              />
            )}
            {canDelete && (
              <Button
                label="Delete coupon"
                leadingIcon="trash-2"
                variant="destructive"
                style={{ marginTop: canEdit ? 12 : 0 }}
                fullWidth
                onPress={onDelete}
              />
            )}
            <Button
              label="Cancel"
              variant="ghost"
              style={{ marginTop: 12 }}
              fullWidth
              onPress={() => setActionsOpen(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

// ── Lifecycle timeline ───────────────────────────────────────────────────────
// Three-step Requested → Approved → Fulfilled progression. Always visible
// regardless of status; the StatusOverline tells the user the current state
// in plain English, while this gives the at-a-glance visual reading.
function LifecycleTimeline({ coupon }: { coupon: Coupon }) {
  const currentStep = statusToStep[coupon.status];

  return (
    <Card style={{ marginTop: 20 }}>
      <Text variant="overline" color="muted">
        Lifecycle
      </Text>
      <Text variant="bodySmall" color="foregroundDim" style={{ marginTop: 6 }}>
        {statusSubtitle[coupon.status]}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
        <StepDot active={currentStep >= 0} label="Requested" />
        <StepLine active={currentStep >= 1} />
        <StepDot active={currentStep >= 1} label="Approved" />
        <StepLine active={currentStep >= 2} />
        <StepDot active={currentStep >= 2} label="Fulfilled" />
      </View>
      {coupon.redeemedAt && (
        <Text variant="caption" color="muted" style={{ marginTop: 14 }}>
          Redeemed {timeAgo(coupon.redeemedAt)}
        </Text>
      )}
      {coupon.fulfilledAt && (
        <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
          Fulfilled {timeAgo(coupon.fulfilledAt)}
        </Text>
      )}
    </Card>
  );
}

// ── Status overline ──────────────────────────────────────────────────────────
function StatusOverline({
  status,
  accent,
}: {
  status: CouponStatus;
  accent: 'sage' | 'gold' | 'rose' | 'muted';
}) {
  const theme = useTheme();
  const colorMap = {
    sage: theme.colors.success,
    gold: theme.colors.accent,
    rose: theme.colors.primary,
    muted: theme.colors.muted,
  };
  const dotColor = colorMap[accent];
  return (
    <View style={styles.overlineRow}>
      <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
      <Text
        variant="overline"
        style={{ color: dotColor, marginLeft: 8 }}
      >
        {status}
      </Text>
    </View>
  );
}

function StepDot({ active, label }: { active?: boolean; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <View
        style={[
          styles.dot,
          {
            backgroundColor: active ? theme.colors.primary : 'transparent',
            borderColor: active ? theme.colors.primary : theme.colors.hairlineStrong,
          },
        ]}
      />
      <Text
        variant="caption"
        color={active ? 'foreground' : 'muted'}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={{ marginTop: 6, textAlign: 'center' }}
      >
        {label}
      </Text>
    </View>
  );
}

function StepLine({ active }: { active?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 18,
        height: 2,
        backgroundColor: active ? theme.colors.primary : theme.colors.hairlineStrong,
        marginBottom: 22,
      }}
    />
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    overflow: 'hidden',
  },
  overlineRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  heroTitle: { marginTop: 14 },
  heroDescription: { marginTop: 14, fontSize: 17, lineHeight: 26 },
  dashRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 16, gap: 4 },
  heroFooter: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    padding: 24,
    paddingBottom: 32,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
});
