import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, TopBar, Text, Card, Button, Chip, Input } from '@/components';
import { useTheme } from '@/theme';
import { couponsApi } from '@/api';
import { Coupon } from '@/types/api';
import { CouponCard } from './CouponsListScreen';
import { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CouponDetail'>;

export function CouponDetailScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');

  useEffect(() => {
    couponsApi.get(route.params.id).then(setCoupon).catch(() => {});
  }, [route.params.id]);

  const refresh = async () => {
    try {
      setCoupon(await couponsApi.get(route.params.id));
    } catch {
      // ignore
    }
  };

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

        {coupon.status === 'Fulfilled' && (
          <Card style={{ marginTop: 24 }}>
            <Text variant="overline" color="muted">
              Rate this experience
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setRating(n)}>
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
                label="Leave a sweet note"
                value={reviewText}
                onChangeText={setReviewText}
                multiline
                rows={3}
              />
            </View>
            <Button
              label={coupon.reviewRating ? 'Update review' : 'Save review'}
              style={{ marginTop: 16 }}
              fullWidth
              onPress={review}
              disabled={!rating}
            />

            {coupon.reviewRating && coupon.recipient !== 'you' && coupon.reviewText ? (
              <Card variant="glass" style={{ marginTop: 16 }}>
                <Text variant="overline" color="muted">
                  Their note
                </Text>
                <Text variant="serifQuote" style={{ fontSize: 16, marginTop: 8 }} italic>
                  “{coupon.reviewText}”
                </Text>
              </Card>
            ) : null}
          </Card>
        )}
      </View>
    </ScreenContainer>
  );
}

function StepDot({ active, label }: { active?: boolean; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', width: 70 }}>
      <View
        style={[
          styles.dot,
          {
            backgroundColor: active ? theme.colors.primary : 'transparent',
            borderColor: active ? theme.colors.primary : theme.colors.hairlineStrong,
          },
        ]}
      />
      <Text variant="caption" color={active ? 'foreground' : 'muted'} style={{ marginTop: 6 }}>
        {label}
      </Text>
    </View>
  );
}

function StepLine({ muted }: { muted?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        height: 2,
        backgroundColor: muted ? theme.colors.hairlineStrong : theme.colors.primary,
        marginHorizontal: 4,
        marginBottom: 22,
      }}
    />
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
});
