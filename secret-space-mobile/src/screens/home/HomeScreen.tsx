import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { ScreenContainer, InlineHeader, Text, Card, Avatar, Chip, BondHeart, Emoji } from '@/components';
import { useTheme } from '@/theme';
import { dashboardApi, settingsApi, tokens } from '@/api';
import { DashboardData, Mood } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { useChatSocket } from '@/context/ChatSocketContext';

const moods: { mood: Mood; label: string }[] = [
  { mood: '😊', label: 'Happy' },
  { mood: '❤️', label: 'Loved' },
  { mood: '⚡', label: 'Energized' },
  { mood: '💭', label: 'Missing you' },
  { mood: '😔', label: 'Sad' },
  { mood: '🌧', label: 'Low' },
  { mood: '😣', label: 'Stressed' },
  { mood: '😠', label: 'Upset' },
  { mood: '😤', label: 'Grumpy' },
];

export function HomeScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { user, refreshProfile } = useAuth();
  const { unreadCount } = useChatSocket();
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Upload the user's own avatar via multipart so large iPhone HEIC photos don't have
  // to be base64-encoded across the bridge. Backend writes to req.user.userId only —
  // there is no way to target the partner's row.
  const pickAndUploadAvatar = useCallback(async () => {
    if (avatarUploading) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photo library access',
          'Allow photo access in Settings to set your profile picture.'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      const accessToken = await tokens.getAccess();
      if (!accessToken) {
        Alert.alert('Session expired', 'Please sign in again.');
        return;
      }

      setAvatarUploading(true);
      const upload = await FileSystem.uploadAsync(settingsApi.avatarUploadUrl(), asset.uri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: asset.mimeType ?? 'image/jpeg',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (upload.status < 200 || upload.status >= 300) {
        let detail = `HTTP ${upload.status}`;
        try {
          const body = JSON.parse(upload.body);
          detail = body.error ?? detail;
        } catch {
          // body wasn't JSON
        }
        throw new Error(detail);
      }
      // refreshProfile pulls the new avatarUrl into AuthContext, which propagates to
      // every screen reading `user.avatarUrl` (Home, Chat header, Settings).
      await refreshProfile();
    } catch (err: any) {
      Alert.alert('Could not update photo', err?.message ?? 'Try again.');
    } finally {
      setAvatarUploading(false);
    }
  }, [avatarUploading, refreshProfile]);

  const fetch = useCallback(async () => {
    try {
      const d = await dashboardApi.get();
      setData(d);
    } catch {
      // surfaced via empty fallback
    }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 5000);
    return () => clearInterval(id);
  }, [fetch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  };

  return (
    <ScreenContainer scroll={false}>
      <InlineHeader
        leadingElement={
          <View style={styles.leading}>
            <Avatar
              uri={user?.avatarUrl ?? null}
              name={user?.name}
              size={32}
              ring="rose"
            />
            <Text variant="bodyMedium" style={{ marginLeft: 10 }} numberOfLines={1}>
              {user?.name?.[0] ?? 'M'} & {user?.partnerName?.[0] ?? 'A'}
            </Text>
          </View>
        }
        rightActions={[
          { icon: 'message-square', onPress: () => navigation.navigate('Chat'), badge: unreadCount },
          { icon: 'settings', onPress: () => navigation.navigate('Settings') },
        ]}
      />

      <ScrollView
        contentContainerStyle={[
          { paddingHorizontal: theme.screenPadding, paddingBottom: theme.bottomNavReserve + 16 },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Bond visual — both per-user avatars. Tap your own to set a photo; the
            partner avatar is read-only (no IDOR vector — backend only writes the
            authenticated user's own row). */}
        <View style={styles.bond}>
          <Pressable
            onPress={pickAndUploadAvatar}
            disabled={avatarUploading}
            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
          >
            <View>
              <Avatar uri={user?.avatarUrl ?? null} name={user?.name} size={88} ring="rose" />
              <View style={[styles.avatarBadge, { backgroundColor: theme.colors.primary, borderColor: theme.colors.background }]}>
                {avatarUploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="camera" size={12} color="#fff" />
                )}
              </View>
            </View>
          </Pressable>
          <View style={styles.bondMid}>
            <View style={[styles.bondLine, { backgroundColor: theme.colors.hairlineStrong }]} />
            <BondHeart size={36} />
            <View style={[styles.bondLine, { backgroundColor: theme.colors.hairlineStrong }]} />
          </View>
          <Avatar
            uri={user?.partnerAvatar ?? null}
            name={user?.partnerName ?? 'Partner'}
            size={88}
            ring="gold"
          />
        </View>

        {/* Anniversary card */}
        <Card style={{ marginTop: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text variant="overline" color="muted">
                Together
              </Text>
              <Text variant="numeralLarge" style={{ marginTop: 4 }}>
                {data?.daysTogether ?? 0}
              </Text>
              <Text variant="bodySmall" color="muted" style={{ marginTop: 4 }}>
                days{user?.anniversaryDate ? ` since ${new Date(user.anniversaryDate).toLocaleDateString()}` : ''}
              </Text>
            </View>
            <Feather name="calendar" size={24} color={theme.colors.muted} style={{ opacity: 0.6 }} />
          </View>
        </Card>

        {/* Mood selector */}
        <Text variant="label" style={{ marginTop: 32, marginBottom: 12 }}>
          How are you feeling?
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {moods.map((m) => {
            const selected = data?.myMood === m.mood;
            return (
              <Pressable
                key={m.mood}
                onPress={() => navigation.navigate('MoodCheckIn')}
                style={[
                  styles.moodPill,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: selected ? theme.colors.primary : theme.colors.hairline,
                    borderWidth: selected ? 2 : 1,
                  },
                ]}
              >
                <Emoji size={20}>{m.mood}</Emoji>
                <Text variant="bodySmall" style={{ marginLeft: 8 }} weight={selected ? 'semibold' : 'medium'}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Today's reason */}
        <Card variant="tinted-rose" style={{ marginTop: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="overline" color="muted" style={{ flex: 1 }}>
              Today's reason
            </Text>
            <Pressable hitSlop={8}>
              <Feather name="refresh-cw" size={16} color={theme.colors.muted} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <View style={{ width: 3, backgroundColor: theme.colors.primary, marginRight: 12, borderRadius: 2 }} />
            {/* numberOfLines={5} is a layout safety net — server caps the reason at
                ~220 chars which is ~4 lines at this font, but if the cap ever slips
                a runaway string will still ellipsize instead of pushing the rest of
                the home screen off the bottom. */}
            <Text variant="serifQuote" style={{ flex: 1, fontSize: 18, lineHeight: 26 }} numberOfLines={5}>
              {data?.todaysReason ?? 'Because they chose you, too.'}
            </Text>
          </View>
        </Card>

        {/* Daily thought — distinct from "Today's Reason" both in label and in
            content category: this slot is a perseverance reflection ("a reason
            to keep showing up"), not a love note. The "FOR THE HARD DAYS"
            overline anchors that intent so the two cards never read as
            duplicates even if a short backend rotation lands on a similar
            phrase. */}
        <Card variant="tinted-gold" padding={16} style={{ marginTop: 12 }}>
          <Text variant="overline" color="muted" style={{ marginBottom: 8 }}>
            For the hard days
          </Text>
          <Text
            variant="serifQuote"
            style={{ fontSize: 14, lineHeight: 20 }}
            italic
            // Layout safety net — server caps the daily thought at 180 chars,
            // which fits comfortably in 3-4 lines at this font. numberOfLines
            // ensures a runaway string would ellipsize rather than push the
            // quick-tiles below it off-screen.
            numberOfLines={5}
          >
            “{data?.dailyThought ?? "Every couple that's still together had a moment they almost weren't."}”
          </Text>
        </Card>

        {/* Quick actions */}
        <View style={styles.quickGrid}>
          <QuickTile icon="book-open" label="Diary" onPress={() => navigation.navigate('Main', { screen: 'Diary' })} />
          <QuickTile icon="tag" label="Coupons" onPress={() => navigation.navigate('Main', { screen: 'Coupons' })} />
          <QuickTile icon="message-circle" label="Love Bot" onPress={() => navigation.navigate('Main', { screen: 'LoveBot' })} />
          <QuickTile icon="lock" label="Vault" onPress={() => navigation.navigate('Main', { screen: 'Vault' })} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function QuickTile({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.quickTileWrap}>
      <View
        style={[
          styles.quickTile,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
        ]}
      >
        <Feather name={icon} size={24} color={theme.colors.foreground} />
        <Text variant="bodySmall" weight="semibold" style={{ marginTop: 12 }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  leading: { flexDirection: 'row', alignItems: 'center' },
  bond: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 },
  bondMid: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  bondLine: { flex: 1, height: 1 },
  moodPill: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 24, marginHorizontal: -6 },
  quickTileWrap: { width: '50%', padding: 6 },
  quickTile: {
    height: 110,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
