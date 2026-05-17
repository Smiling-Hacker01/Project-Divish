import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { ScreenContainer, TopBar, Text, Avatar, Button, Chip, SegmentedControl } from '@/components';
import { useTheme, useThemePreference } from '@/theme';
import { useAuth } from '@/context/AuthContext';
import { settingsApi } from '@/api';

/**
 * Settings layout system
 * ────────────────────────────────────────────────────────────────────────────
 * All rows on this screen use SettingsRow/SettingsRowSwitch with the same spacing
 * primitives. The single design decision that matters: the **leading slot has
 * natural width**, not a hard-coded 28px. Icons size themselves to ~20px, avatars
 * to 44, switches/chips trail naturally — all separated by a uniform `gap`.
 * Previously the slot was fixed at 28px, which made 48px avatars overflow
 * (bleeding into the card edge + eating the gap to the title) while 20px icons
 * looked fine. That asymmetry is gone.
 *
 * Constants below are the spacing system for this screen; reuse them rather than
 * sprinkling magic numbers.
 */
const ROW_PADDING_H = 16;
const ROW_PADDING_V = 14;
const ROW_GAP = 14;
const ROW_MIN_HEIGHT = 60;
const SECTION_GAP_TOP = 24;
const AVATAR_LEADING_SIZE = 44; // Avatar tile size used in leading slots
const ICON_SIZE = 20;

export function SettingsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { preference, setPreference } = useThemePreference();
  const { user, logout, notificationsEnabled, setNotificationsEnabled, refreshProfile } = useAuth();
  const [faceSheetOpen, setFaceSheetOpen] = useState(false);

  const onFaceIdPress = () => {
    // Active → present a sheet with two destructive-leaning options. Inactive →
    // jump straight to the (settings-context) re-enroll screen, which uses JWT
    // auth rather than the signup-time email+password flow.
    if (user?.faceMFAEnabled) {
      setFaceSheetOpen(true);
    } else {
      navigation.navigate('FaceReenroll');
    }
  };

  const reenrollFace = () => {
    setFaceSheetOpen(false);
    // Brief delay so the modal animates out before the next screen takes over —
    // same iOS modal-on-modal pattern we use elsewhere.
    setTimeout(() => navigation.navigate('FaceReenroll'), 250);
  };

  const disableFace = () => {
    setFaceSheetOpen(false);
    Alert.alert(
      'Turn off Face ID?',
      "You'll only be able to sign in with your email and password. You can re-enroll any time.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off',
          style: 'destructive',
          onPress: async () => {
            try {
              await settingsApi.deleteFaceDescriptor();
              await refreshProfile();
            } catch (e: any) {
              Alert.alert(
                'Could not turn off Face ID',
                e?.response?.data?.error ?? e?.message ?? 'Try again later.'
              );
            }
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer scroll>
      <TopBar title="Settings" />
      <View style={{ paddingHorizontal: theme.screenPadding, paddingTop: 8, paddingBottom: 32 }}>
        <SettingsSection label="Profile">
          <SettingsRow
            leading={
              <Avatar
                uri={user?.avatarUrl ?? null}
                name={user?.name}
                size={AVATAR_LEADING_SIZE}
                ring="rose"
              />
            }
            title={user?.name ?? 'You'}
            subtitle={user?.email ?? ''}
            chevron
          />
        </SettingsSection>

        <SettingsSection label="Partner">
          {user?.partnerName ? (
            <SettingsRow
              leading={
                <Avatar
                  uri={user?.partnerAvatar ?? null}
                  name={user.partnerName}
                  size={AVATAR_LEADING_SIZE}
                  ring="gold"
                />
              }
              title={user.partnerName}
              trailing={<Chip label="Linked" tone="sage" size="sm" />}
            />
          ) : (
            <SettingsRow
              leading={<Avatar name="?" size={AVATAR_LEADING_SIZE} ring="gold" />}
              title="Waiting for partner"
              subtitle="Share your couple code so they can join."
              trailing={<Chip label="Waiting" tone="gold" size="sm" />}
            />
          )}
          {/* Couple code row — no leading icon; the code itself is the visual anchor as
              a copy-to-clipboard pill on the right. Premium feel, single-tap copy. */}
          <SettingsRow
            title="Couple code"
            trailing={<CouplePill code={user?.coupleCode ?? null} />}
          />
          {/* Only the couple creator can actually unlink — the joining partner sees
              the row but it's inert. */}
          {user?.partnerName && (
            <SettingsRow
              title="Unlink partner"
              subtitle={user?.isCreator ? undefined : 'Only the partner who created this space can unlink.'}
              titleColor="destructive"
              disabled={!user?.isCreator}
              onPress={user?.isCreator ? () => settingsApi.unlinkPartner() : undefined}
            />
          )}
        </SettingsSection>

        <SettingsSection label="Anniversary">
          <SettingsRow
            leading={<IconLeading name="calendar" />}
            title="Anniversary date"
            trailing={
              <Text variant="bodySmall" color="muted">
                {user?.anniversaryDate ? new Date(user.anniversaryDate).toLocaleDateString() : 'Set date'}
              </Text>
            }
            chevron
          />
        </SettingsSection>

        <SettingsSection label="Security">
          <SettingsRow
            leading={<IconLeading name="user-check" />}
            title="Face ID"
            onPress={onFaceIdPress}
            trailing={
              user?.faceMFAEnabled ? (
                <Chip label="Active" tone="sage" size="sm" />
              ) : (
                <Chip label="Off" tone="muted" size="sm" />
              )
            }
            chevron
          />
          <SettingsRow
            leading={<IconLeading name="key" />}
            title="Change password"
            onPress={() => navigation.navigate('ChangePassword')}
            chevron
          />
        </SettingsSection>

        <SettingsSection label="Notifications">
          <SettingsRowSwitch
            leading={<IconLeading name="bell" />}
            title="All notifications"
            value={notificationsEnabled}
            onValueChange={(v) => {
              void setNotificationsEnabled(v);
            }}
          />
        </SettingsSection>

        <SettingsSection label="Appearance">
          <View style={{ padding: 12 }}>
            <SegmentedControl
              segments={[
                { key: 'system', label: 'System' },
                { key: 'light', label: 'Light' },
                { key: 'dark', label: 'Dark' },
              ]}
              value={preference}
              onChange={(k) => setPreference(k as any)}
            />
          </View>
        </SettingsSection>

        <SettingsSection label="About">
          <SettingsRow
            leading={<IconLeading name="heart" />}
            title="About this app"
            subtitle="The story behind The Secret Space"
            onPress={() => navigation.navigate('About')}
            chevron
          />
        </SettingsSection>

        <SettingsSection label="Account">
          <SettingsRow title="Log out" titleColor="muted" onPress={logout} />
          <SettingsRow title="Leave the space" titleColor="destructive" onPress={() => {}} />
        </SettingsSection>
      </View>

      {/* Face ID action sheet — shown when the row is tapped and Face MFA is
          currently active. Re-enroll routes through the same FaceEnrollScreen used
          at signup. Turn off hits DELETE /settings/face-descriptor. */}
      <Modal
        visible={faceSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFaceSheetOpen(false)}
      >
        <Pressable style={styles.sheetScrim} onPress={() => setFaceSheetOpen(false)}>
          <Pressable
            onPress={() => {}}
            style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: theme.colors.hairlineStrong }]} />
            <Text variant="h3" align="center" style={{ marginTop: 16, marginBottom: 4 }}>
              Face ID
            </Text>
            <Text variant="bodySmall" color="muted" align="center" style={{ marginBottom: 20 }}>
              Re-enroll your face or turn off this sign-in method.
            </Text>
            <Button label="Re-enroll face" leadingIcon="user-check" fullWidth onPress={reenrollFace} />
            <Button
              label="Turn off Face ID"
              leadingIcon="x-circle"
              variant="ghost"
              style={{ marginTop: 8 }}
              fullWidth
              onPress={disableFace}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

// ── Couple-code pill ────────────────────────────────────────────────────────
// Mono-font code on a subtle surface tile, single-tap copies to clipboard with
// a haptic confirmation and a brief "Copied" state. Production-app convention.
function CouplePill({ code }: { code: string | null }) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // surface nothing — copy failures on RN are rare and not actionable
    }
  };

  return (
    <Pressable
      onPress={onCopy}
      disabled={!code}
      hitSlop={6}
      style={({ pressed }) => [
        styles.couplePill,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.hairlineStrong,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text variant="mono" style={{ fontSize: 13, letterSpacing: 1, color: theme.colors.foreground }}>
        {code ?? '——'}
      </Text>
      <Feather
        name={copied ? 'check' : 'copy'}
        size={13}
        color={copied ? theme.colors.success : theme.colors.muted}
        style={{ marginLeft: 8 }}
      />
    </Pressable>
  );
}

// ── IconLeading ──────────────────────────────────────────────────────────────
// Standardised icon for the leading slot — same visual weight everywhere so all
// icon rows align consistently regardless of which screen they're on.
function IconLeading({ name }: { name: keyof typeof Feather.glyphMap }) {
  const theme = useTheme();
  return <Feather name={name} size={ICON_SIZE} color={theme.colors.foreground} />;
}

// ── SettingsSection ──────────────────────────────────────────────────────────
function SettingsSection({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ marginTop: SECTION_GAP_TOP }}>
      <Text variant="overline" color="muted" style={{ marginLeft: 4, marginBottom: 8 }}>
        {label}
      </Text>
      <View
        style={[
          styles.group,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
        ]}
      >
        {React.Children.map(children, (child, i) => (
          <View key={i}>
            {i > 0 && <View style={[styles.divider, { backgroundColor: theme.colors.hairline }]} />}
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── SettingsRow ──────────────────────────────────────────────────────────────
// Single row primitive. The contract:
//   • leading slot sizes to its content (no fixed width)
//   • title + optional subtitle are centred vertically with the leading element
//   • optional trailing slot (chip, text, custom) sits to the right of title
//   • optional chevron tucks at the far right
//   • the row's minHeight keeps single-line rows uniform with multi-line ones
function SettingsRow({
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  titleColor = 'foreground',
  onPress,
  disabled,
  style,
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  chevron?: boolean;
  titleColor?: 'foreground' | 'muted' | 'destructive';
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        { opacity: disabled ? 0.45 : pressed && onPress ? 0.7 : 1 },
        style,
      ]}
    >
      <View style={styles.row}>
        {leading && <View style={styles.leading}>{leading}</View>}
        <View style={styles.body}>
          <Text variant="bodyMedium" color={titleColor}>
            {title}
          </Text>
          {subtitle && (
            <Text variant="bodySmall" color="muted" style={{ marginTop: 4 }}>
              {subtitle}
            </Text>
          )}
        </View>
        {trailing && <View style={styles.trailing}>{trailing}</View>}
        {chevron && !disabled && (
          <Feather
            name="chevron-right"
            size={18}
            color={theme.colors.muted}
            style={{ marginLeft: 8 }}
          />
        )}
      </View>
    </Pressable>
  );
}

// ── SettingsRowSwitch ────────────────────────────────────────────────────────
function SettingsRowSwitch({
  leading,
  title,
  value,
  onValueChange,
}: {
  leading?: React.ReactNode;
  title: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={() => onValueChange(!value)}>
      <View style={styles.row}>
        {leading && <View style={styles.leading}>{leading}</View>}
        <View style={styles.body}>
          <Text variant="bodyMedium">{title}</Text>
        </View>
        <View
          style={[
            styles.toggleTrack,
            { backgroundColor: value ? theme.colors.primary : theme.colors.hairlineStrong },
          ]}
        >
          <View style={[styles.toggleThumb, { transform: [{ translateX: value ? 20 : 0 }] }]} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  // The row is the entire interactive surface. minHeight ensures single-line rows
  // (icon + title only) match the height of multi-line ones (avatar + title + subtitle).
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_MIN_HEIGHT,
    paddingHorizontal: ROW_PADDING_H,
    paddingVertical: ROW_PADDING_V,
  },
  // Natural-width leading slot — sizes to its child (icon: ~20px, avatar: ~44px).
  // marginRight is the gap to the title; alignItems centres the icon vertically when
  // the title has a subtitle (and the row gets taller).
  leading: { marginRight: ROW_GAP, justifyContent: 'center', alignItems: 'center' },
  body: { flex: 1, justifyContent: 'center' },
  trailing: { marginLeft: 12, flexShrink: 0 },
  // Full-bleed divider inside the card — modern minimalist look. Avoids the ragged
  // look you'd get trying to align the divider after a variable-width leading.
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: ROW_PADDING_H },
  toggleTrack: { width: 44, height: 24, borderRadius: 12, padding: 2, justifyContent: 'center' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  couplePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  sheetScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    padding: 24,
    paddingBottom: 32,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
});
