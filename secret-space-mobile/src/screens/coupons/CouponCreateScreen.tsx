import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ScreenContainer, TopBar, Text, Input, Button, Chip, Avatar, toast } from '@/components';
import { useTheme } from '@/theme';
import { CouponCard } from './CouponsListScreen';
import { couponsApi } from '@/api';
import { Coupon } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { RootStackParamList } from '@/navigation/types';

type ExpiryChoice = '1w' | '1m' | '3m';

export function CouponCreateScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'CouponCreate'>>();
  const { user } = useAuth();

  // Edit-mode is determined by the presence of a couponId param. When set, the
  // screen pre-loads that coupon and PATCHes on submit. When absent, it's a
  // standard create flow.
  const editingId = route.params?.couponId;
  const isEdit = !!editingId;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expiry, setExpiry] = useState<ExpiryChoice | null>('1m');
  // Edit mode shows the original ISO expiry until the user picks a new
  // duration. If they don't change anything we send the original value back.
  const [originalExpiryIso, setOriginalExpiryIso] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  // Pre-load coupon when in edit mode. We deliberately ignore errors and just
  // close the screen — the parent list will refetch on focus anyway, so if the
  // coupon vanished (deleted from another device) the user lands back on a
  // self-correcting list.
  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    couponsApi
      .get(editingId)
      .then((c) => {
        if (cancelled) return;
        setTitle(c.title);
        setDescription(c.description);
        setOriginalExpiryIso(c.expiry ?? null);
        // If the original expiry exists we set the picker to "no change yet"
        // (null). Selecting any chip overrides this with a fresh duration.
        setExpiry(null);
        setLoading(false);
      })
      .catch(() => {
        toast.error('Could not load coupon to edit.');
        navigation.goBack();
      });
    return () => {
      cancelled = true;
    };
  }, [editingId, navigation]);

  const expiryDate = useMemo(() => {
    // If the user hasn't picked a chip in edit mode, preserve the existing
    // expiry instead of forcing a recalculation.
    if (expiry === null) return originalExpiryIso ?? undefined;
    const d = new Date();
    if (expiry === '1w') d.setDate(d.getDate() + 7);
    else if (expiry === '1m') d.setMonth(d.getMonth() + 1);
    else if (expiry === '3m') d.setMonth(d.getMonth() + 3);
    return d.toISOString();
  }, [expiry, originalExpiryIso]);

  const valid = title.trim().length > 0 && description.trim().length > 0;

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      if (isEdit && editingId) {
        await couponsApi.update(editingId, {
          title: title.trim(),
          description: description.trim(),
          expiresAt: expiryDate ?? null,
        });
        toast.success('Coupon updated.');
      } else {
        await couponsApi.create({
          title: title.trim(),
          description: description.trim(),
          expiresAt: expiryDate,
        });
      }
      navigation.goBack();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'Could not save the coupon.');
    } finally {
      setSubmitting(false);
    }
  };

  const previewCoupon: Coupon = {
    id: 'preview',
    title: title || 'Title appears here',
    description: description || 'Describe what you are promising…',
    status: 'Active',
    expiry: expiryDate,
    creator: 'you',
    recipient: 'partner',
    createdAt: new Date().toISOString(),
  };

  return (
    <ScreenContainer>
      <TopBar
        showBack={false}
        leadingElement={
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text variant="bodyMedium" color="primary">
              Cancel
            </Text>
          </Pressable>
        }
        title={isEdit ? 'Edit coupon' : 'New coupon'}
        // The primary action lives inside the top bar instead of floating
        // below it. The previous implementation used a `marginTop: -44` hack
        // to lift a separate Button onto the bar — fragile against any bar
        // height change and visually disconnected. Putting it in the
        // dedicated trailingElement slot fixes both.
        trailingElement={
          <Button
            label={isEdit ? 'Save' : 'Send'}
            size="sm"
            onPress={submit}
            disabled={!valid || loading}
            loading={submitting}
          />
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingBottom: 32,
            paddingTop: 16,
            gap: 20,
          }}
        >
          <Input label="Title" value={title} onChangeText={setTitle} placeholder="e.g., One slow morning in" />
          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            rows={4}
            placeholder="Describe what you are promising…"
          />

          <View>
            <Text variant="overline" color="muted">
              Expires
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {(
                [
                  { key: '1w', label: '1 week' },
                  { key: '1m', label: '1 month' },
                  { key: '3m', label: '3 months' },
                ] as const
              ).map((opt) => (
                <Chip
                  key={opt.key}
                  label={opt.label}
                  selected={expiry === opt.key}
                  onPress={() => setExpiry(opt.key)}
                  tone={expiry === opt.key ? 'gradient' : 'glass'}
                />
              ))}
            </View>
            {isEdit && expiry === null && originalExpiryIso && (
              <Text variant="caption" color="muted" style={{ marginTop: 10 }}>
                Currently expires {new Date(originalExpiryIso).toLocaleDateString()} ·
                tap a chip to change it.
              </Text>
            )}
          </View>

          <View>
            <Text variant="overline" color="muted">
              To
            </Text>
            <View
              style={[
                styles.toRow,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
              ]}
            >
              <Avatar
                uri={user?.partnerAvatar ?? null}
                name={user?.partnerName ?? 'P'}
                size={28}
                ring="gold"
              />
              <Text variant="bodyMedium" style={{ marginLeft: 10 }}>
                {user?.partnerName ?? 'Your partner'}
              </Text>
            </View>
          </View>

          <View>
            <Text variant="overline" color="muted" style={{ marginBottom: 12 }}>
              Preview
            </Text>
            <CouponCard coupon={previewCoupon} onPress={() => {}} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  toRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
  },
});
