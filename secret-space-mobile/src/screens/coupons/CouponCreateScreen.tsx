import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar, Text, Input, Button, Chip, Card, Avatar } from '@/components';
import { useTheme } from '@/theme';
import { CouponCard } from './CouponsListScreen';
import { couponsApi } from '@/api';
import { Coupon } from '@/types/api';
import { useAuth } from '@/context/AuthContext';

export function CouponCreateScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expiry, setExpiry] = useState<'1w' | '1m' | '3m' | null>('1m');
  const [submitting, setSubmitting] = useState(false);

  const expiryDate = useMemo(() => {
    const d = new Date();
    if (expiry === '1w') d.setDate(d.getDate() + 7);
    else if (expiry === '1m') d.setMonth(d.getMonth() + 1);
    else if (expiry === '3m') d.setMonth(d.getMonth() + 3);
    return d.toISOString();
  }, [expiry]);

  const valid = title.trim() && description.trim();

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      await couponsApi.create({
        title: title.trim(),
        description: description.trim(),
        expiresAt: expiryDate,
      });
      navigation.goBack();
    } catch (e: any) {
      console.warn('[Coupon create] failed', e?.response?.data ?? e?.message);
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
          <Pressable onPress={() => navigation.goBack()}>
            <Text variant="bodyMedium" color="primary">
              Cancel
            </Text>
          </Pressable>
        }
        title="New coupon"
      />
      <View style={{ alignSelf: 'flex-end', marginTop: -44, marginRight: theme.screenPadding, marginBottom: 8 }}>
        <Button label="Send" size="sm" onPress={submit} disabled={!valid} loading={submitting} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: theme.screenPadding, paddingBottom: 32, paddingTop: 8, gap: 20 }}
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
              <Avatar name={user?.partnerName ?? 'P'} size={28} ring="gold" />
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
