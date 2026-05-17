import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, TopBar, Text, Card, Button, Chip, Input } from '@/components';
import { useTheme } from '@/theme';
import { couponsApi } from '@/api';
import { Coupon } from '@/types/api';
import { CouponCard } from './CouponsListScreen';
import { RootStackParamList } from '@/navigation/types';
import { useChatSocket } from '@/context/ChatSocketContext';

type Props = NativeStackScreenProps<RootStackParamList, 'CouponDetail'>;

export function CouponDetailScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const { subscribeCoupons } = useChatSocket();
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');

  useEffect(() => {
    couponsApi.get(route.params.id).then(setCoupon).catch(() => {});
  }, [route.params.id]);

  const refresh = useCallback(async () => {
    try {
      setCoupon(await couponsApi.get(route.params.id));
    } catch {
      // ignore
    }
  }, [route.params.id]);

  // Realtime: refetch when ANY coupon lifecycle event fires for this coupon — so
  // when the creator approves or fulfills it on their device, the recipient's
  // detail screen reflects the new state immediately.
  useEffect(() => {
    const unsub = subscribeCoupons((evt) => {
      if (evt.couponId === route.params.id) refresh();
    });
    return unsub;
  }, [subscribeCoupons, route.params.id, refresh]);

  if (!coupon)
    return (
      <ScreenContainer>
        <TopBar title="" />
      </ScreenContainer>
    );

  // Lifecycle helpers
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

  return (
    <ScreenContainer scroll>
      <TopBar title="" rightActions={[{ icon: 'more-horizontal', onPress: () => {} }]} />
      <View style={{ paddingHorizontal: theme.screenPadding, paddingTop: 24, paddingBottom: 32 }}>
        <CouponCard coupon={coupon} onPress={() => {}} />

        <View style={[styles.metaRow]}>
          <Chip label={`From ${coupon.creator}`} tone="muted" size="sm" />
          <Chip label={`Created ${new Date(coupon.createdAt).toLocaleDateString()}`} tone="muted" size="sm" />
          {coupon.expiry && (
            <Chip label={`Expires ${new Date(coupon.expiry).toLocaleDateString()}`} tone="muted" size="sm" />
          )}
        </View>

        {coupon.recipient === 'you' && coupon.status === 'Active' && (
          <Button
            label="Redeem this coupon"
            fullWidth
            style={{ marginTop: 24 }}
            onPress={redeem}
            leadingIcon="check-circle"
          />
        )}

        {coupon.status === 'Pending' && (
          <Card style={{ marginTop: 24 }}>
            <Text variant="overline" color="muted">
              Status
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
              <StepDot active label="Requested" />
              <StepLine />
              <StepDot label="Approved" />
              <StepLine muted />
              <StepDot label="Fulfilled" />
            </View>
            {coupon.creator === 'you' && (
              <Button
                label="Approve redemption"
                fullWidth
                style={{ marginTop: 16 }}
                onPress={approve}
                leadingIcon="thumbs-up"
              />
            )}
          </Card>
        )}

        {coupon.status === 'Used' && coupon.creator === 'you' && (
          <Button
            label="Mark as fulfilled"
            fullWidth
            style={{ marginTop: 24 }}
            onPress={markFulfilled}
            leadingIcon="check"
          />
        )}

        {coupon.status === 'Fulfilled' && (() => {
          const reviewSubmitted = coupon.reviewRating !== null && coupon.reviewRating !== undefined;
          const isRecipient = coupon.recipient === 'you';
          const ratingValue = coupon.reviewRating ?? 0;

          // Three distinct UI states for the review card:
          //   1. Recipient hasn't reviewed yet → show form, only the recipient sees it
          //   2. Recipient is waiting on themselves to review → recipient sees form,
          //      creator sees a "Awaiting their note" placeholder
          //   3. Review submitted → both see the read-only review card
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
                    {new Date(coupon.reviewedAt).toLocaleString()}
                  </Text>
                )}
              </Card>
            );
          }

          // No review yet — only the recipient can submit one. The creator sees a
          // soft placeholder so they know feedback is pending.
          if (!isRecipient) {
            return (
              <Card variant="glass" style={{ marginTop: 24 }}>
                <Text variant="overline" color="muted">
                  Their review
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                  <Feather name="clock" size={14} color={theme.colors.muted} />
                  <Text variant="bodySmall" color="muted" style={{ marginLeft: 8 }}>
                    Waiting for {coupon.recipient === 'you' ? 'your' : 'their'} note…
                  </Text>
                </View>
              </Card>
            );
          }

          // Recipient + not yet reviewed → show the form.
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
    </ScreenContainer>
  );
}

// Each step takes 1/3 of the row width — the wider allotment guarantees long labels
// like "Requested" / "Fulfilled" fit on a single line on every screen size, and the
// connecting StepLine still gets a flex segment between dots.
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

function StepLine({ muted }: { muted?: boolean }) {
  const theme = useTheme();
  // marginBottom aligns the connector line with the centre of the dots above the
  // label. The label area is roughly 20px tall (line-height + margin), so we push
  // the line up by ~half that to land on the dot's vertical centre.
  return (
    <View
      style={{
        width: 18,
        height: 2,
        backgroundColor: muted ? theme.colors.hairlineStrong : theme.colors.primary,
        marginBottom: 22,
      }}
    />
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
});
