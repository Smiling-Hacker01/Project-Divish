import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar, Text, Avatar, Chip, SegmentedControl } from '@/components';
import { useTheme, useThemePreference } from '@/theme';
import { useAuth } from '@/context/AuthContext';
import { settingsApi } from '@/api';

export function SettingsScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { preference, setPreference } = useThemePreference();
  const { user, logout, notificationsEnabled, setNotificationsEnabled } = useAuth();

  return (
    <ScreenContainer scroll>
      <TopBar title="Settings" />
      <View style={{ paddingHorizontal: theme.screenPadding, paddingTop: 8, paddingBottom: 32 }}>
        <Section label="Profile">
          <Row
            leading={
              <Avatar uri={user?.avatarUrl ?? null} name={user?.name} size={48} ring="rose" />
            }
            title={user?.name ?? 'You'}
            subtitle={user?.email ?? ''}
            chevron
          />
        </Section>

        <Section label="Partner">
          {user?.partnerName ? (
            <Row
              leading={
                <Avatar
                  uri={user?.partnerAvatar ?? null}
                  name={user.partnerName}
                  size={48}
                  ring="gold"
                />
              }
              title={user.partnerName}
              trailing={<Chip label="Linked" tone="sage" size="sm" />}
            />
          ) : (
            <Row
              leading={<Avatar name="?" size={48} ring="gold" />}
              title="Waiting for partner"
              subtitle="Share your couple code so they can join."
              trailing={<Chip label="Waiting" tone="gold" size="sm" />}
            />
          )}
          <Row
            leading={<Feather name="hash" size={20} color={theme.colors.foreground} />}
            title="Couple code"
            trailing={
              <Text variant="mono" style={{ fontSize: 14 }}>
                {user?.coupleCode ?? '------'}
              </Text>
            }
          />
          {/* Only the couple creator can actually unlink — the joining partner sees the row but it's inert. */}
          {user?.partnerName && (
            <Row
              title="Unlink partner"
              subtitle={user?.isCreator ? undefined : 'Only the partner who created this space can unlink.'}
              titleColor="destructive"
              disabled={!user?.isCreator}
              onPress={user?.isCreator ? () => settingsApi.unlinkPartner() : undefined}
            />
          )}
        </Section>

        <Section label="Anniversary">
          <Row
            leading={<Feather name="calendar" size={20} color={theme.colors.foreground} />}
            title="Anniversary date"
            trailing={
              <Text variant="bodySmall" color="muted">
                {user?.anniversaryDate ? new Date(user.anniversaryDate).toLocaleDateString() : 'Set date'}
              </Text>
            }
            chevron
          />
        </Section>

        <Section label="Security">
          <Row
            leading={<Feather name="user-check" size={20} color={theme.colors.foreground} />}
            title="Face ID"
            trailing={user?.faceMFAEnabled ? <Chip label="Active" tone="sage" size="sm" /> : <Chip label="Off" tone="muted" size="sm" />}
            chevron
          />
          <Row
            leading={<Feather name="key" size={20} color={theme.colors.foreground} />}
            title="Change password"
            chevron
          />
        </Section>

        <Section label="Notifications">
          <RowSwitch
            leading={<Feather name="bell" size={20} color={theme.colors.foreground} />}
            title="All notifications"
            value={notificationsEnabled}
            onValueChange={(v) => {
              void setNotificationsEnabled(v);
            }}
          />
        </Section>

        <Section label="Appearance">
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
        </Section>

        <Section label="Account">
          <Row title="Log out" titleColor="muted" onPress={logout} />
          <Row title="Leave the space" titleColor="destructive" onPress={() => {}} />
        </Section>
      </View>
    </ScreenContainer>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ marginTop: 24 }}>
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

function Row({
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  titleColor = 'foreground',
  onPress,
  disabled,
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  chevron?: boolean;
  titleColor?: 'foreground' | 'muted' | 'destructive';
  onPress?: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        { opacity: disabled ? 0.45 : pressed && onPress ? 0.7 : 1 },
      ]}
    >
      <View style={styles.row}>
        {leading && <View style={{ marginRight: 14, width: 28, alignItems: 'center' }}>{leading}</View>}
        <View style={{ flex: 1 }}>
          <Text variant="bodyMedium" color={titleColor}>
            {title}
          </Text>
          {subtitle && (
            <Text variant="bodySmall" color="muted" style={{ marginTop: 2 }}>
              {subtitle}
            </Text>
          )}
        </View>
        {trailing}
        {chevron && !disabled && (
          <Feather name="chevron-right" size={20} color={theme.colors.muted} style={{ marginLeft: 8 }} />
        )}
      </View>
    </Pressable>
  );
}

function RowSwitch({
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
        {leading && <View style={{ marginRight: 14, width: 28, alignItems: 'center' }}>{leading}</View>}
        <View style={{ flex: 1 }}>
          <Text variant="bodyMedium">{title}</Text>
        </View>
        <View
          style={[
            styles.toggleTrack,
            { backgroundColor: value ? theme.colors.primary : theme.colors.hairlineStrong },
          ]}
        >
          <View
            style={[styles.toggleThumb, { transform: [{ translateX: value ? 20 : 0 }] }]}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 60 },
  toggleTrack: { width: 44, height: 24, borderRadius: 12, padding: 2, justifyContent: 'center' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
});
