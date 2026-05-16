import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar, Text, Card, Button, SwitchRow } from '@/components';
import { useTheme } from '@/theme';
import { lovebotApi } from '@/api';
import { LoveBotSettings } from '@/types/api';

export function LoveBotScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const [settings, setSettings] = useState<LoveBotSettings | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const formatTime = (hhmm: string | undefined) => {
    if (!hhmm) return '9:30 AM';
    const [hStr, mStr] = hhmm.split(':');
    const h = Number(hStr);
    const m = Number(mStr);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const updateTime = async (next: Date) => {
    if (!settings) return;
    const hh = String(next.getHours()).padStart(2, '0');
    const mm = String(next.getMinutes()).padStart(2, '0');
    const time = `${hh}:${mm}`;
    setSettings({ ...settings, time });
    try {
      await lovebotApi.updateSettings({ mode: settings.mode, time });
    } catch {
      // revert if server rejects
      fetch();
    }
  };

  const fetch = useCallback(async () => {
    try {
      setSettings(await lovebotApi.getSettings());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Refresh when returning from AddReason or another tab.
  useFocusEffect(
    useCallback(() => {
      fetch();
    }, [fetch])
  );

  const updateMode = async (mode: 'off' | 'daily' | 'surprise') => {
    if (!settings) return;
    setSettings({ ...settings, mode });
    await lovebotApi.updateSettings({ mode, time: settings.time });
  };

  const togglePartner = async (v: boolean) => {
    if (!settings) return;
    setSettings({ ...settings, userBAccessGranted: v });
    await lovebotApi.updateSettings({ mode: settings.mode, time: settings.time, userBAccessGranted: v });
  };

  const removeReason = async (id: string) => {
    if (!settings) return;
    setSettings({ ...settings, reasons: settings.reasons.filter((r) => r.id !== id) });
    await lovebotApi.removeReason(id);
  };

  return (
    <ScreenContainer scroll={false}>
      <TopBar showBack={false} leadingElement={<View style={{ width: 40 }} />} title="Love Bot" rightActions={[{ icon: 'info', onPress: () => {} }]} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.screenPadding,
          paddingTop: 8,
          paddingBottom: theme.bottomNavReserve + 16,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <LinearGradient
              colors={theme.gradientStops as unknown as readonly [string, string]}
              style={styles.botAvatar}
            >
              <Feather name="message-circle" size={22} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text variant="h3" style={{ fontSize: 18 }}>
                Sweet messages on autopilot
              </Text>
              <Text variant="bodySmall" color="muted" style={{ marginTop: 4 }}>
                Schedule reasons your partner will receive without you lifting a finger.
              </Text>
            </View>
          </View>
        </Card>

        {/* Mode picker */}
        <Text variant="overline" color="muted" style={{ marginTop: 8 }}>
          Schedule
        </Text>
        <View style={{ gap: 12 }}>
          {(
            [
              { key: 'off', label: 'Off', helper: 'No automatic messages.', icon: 'pause' },
              { key: 'daily', label: 'Daily', helper: 'One reason at the same time every day.', icon: 'clock' },
              { key: 'surprise', label: 'Surprise', helper: 'Random times throughout the week.', icon: 'star' },
            ] as const
          ).map((opt) => {
            const active = settings?.mode === opt.key;
            return (
              <View key={opt.key}>
                <Pressable onPress={() => updateMode(opt.key)}>
                  <View
                    style={[
                      styles.modeCard,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: active ? theme.colors.primary : theme.colors.hairline,
                        borderWidth: active ? 1.5 : 1,
                      },
                    ]}
                  >
                    <Feather name={opt.icon as any} size={22} color={active ? theme.colors.primary : theme.colors.foreground} />
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text variant="bodyMedium">{opt.label}</Text>
                      <Text variant="bodySmall" color="muted" style={{ marginTop: 2 }}>
                        {opt.helper}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.radio,
                        {
                          backgroundColor: active ? theme.colors.primary : 'transparent',
                          borderColor: active ? theme.colors.primary : theme.colors.hairlineStrong,
                        },
                      ]}
                    >
                      {active && <Feather name="check" size={14} color="#fff" />}
                    </View>
                  </View>
                </Pressable>

                {opt.key === 'daily' && active && (
                  <View
                    style={[
                      styles.timeRow,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.hairline,
                      },
                    ]}
                  >
                    <Feather name="clock" size={18} color={theme.colors.muted} />
                    <Text variant="bodySmall" color="muted" style={{ marginLeft: 10, flex: 1 }}>
                      Send at
                    </Text>
                    {Platform.OS === 'ios' ? (
                      <DateTimePicker
                        value={timeToDate(settings?.time)}
                        mode="time"
                        display="compact"
                        onChange={(_, d) => d && updateTime(d)}
                        themeVariant={theme.scheme}
                      />
                    ) : (
                      <>
                        <Pressable
                          onPress={() => setPickerOpen(true)}
                          style={[styles.timeChip, { borderColor: theme.colors.primary }]}
                        >
                          <Text variant="bodyMedium" color="primary" weight="semibold">
                            {formatTime(settings?.time)}
                          </Text>
                        </Pressable>
                        {pickerOpen && (
                          <DateTimePicker
                            value={timeToDate(settings?.time)}
                            mode="time"
                            display="default"
                            onChange={(_, d) => {
                              setPickerOpen(false);
                              if (d) updateTime(d);
                            }}
                          />
                        )}
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <SwitchRow
          label="Let them add reasons too"
          description="Your partner can contribute to the queue."
          value={settings?.userBAccessGranted ?? false}
          onValueChange={togglePartner}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <Text variant="overline" color="muted" style={{ flex: 1 }}>
            Your reasons
          </Text>
          <Text variant="caption" color="muted">
            {settings?.reasons.length ?? 0} TOTAL
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          {(settings?.reasons ?? []).map((r) => (
            <View
              key={r.id}
              style={[
                styles.reasonRow,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
              ]}
            >
              <Feather name="more-vertical" size={14} color={theme.colors.muted} style={{ opacity: 0.5 }} />
              <Text variant="serifBody" style={{ flex: 1, marginLeft: 12, fontSize: 16 }} numberOfLines={1}>
                {r.text}
              </Text>
              <Pressable onPress={() => removeReason(r.id)} hitSlop={8}>
                <Feather name="trash-2" size={16} color={theme.colors.muted} />
              </Pressable>
            </View>
          ))}
          {settings?.reasons.length === 0 && (
            <Text variant="bodySmall" color="muted" align="center" style={{ paddingVertical: 24 }}>
              Add a reason to get started.
            </Text>
          )}
        </View>

        <Button label="Add a reason" leadingIcon="plus" fullWidth onPress={() => navigation.navigate('AddReason')} />

        {/* Preview */}
        <Card variant="tinted-gold" style={{ marginTop: 8 }}>
          <Text variant="overline" color="muted">
            Up next
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
            <View style={[styles.appIcon, { backgroundColor: theme.colors.surface }]}>
              <Feather name="heart" size={14} color={theme.colors.primary} />
            </View>
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text variant="caption" color="muted">
                The Secret Space · {settings?.time ?? '9:30 AM'}
              </Text>
              <Text variant="bodySmall" weight="medium" style={{ marginTop: 2 }} numberOfLines={2}>
                Because {settings?.reasons[0]?.text ?? 'they smile when you walk into a room.'}
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

function timeToDate(hhmm?: string): Date {
  const d = new Date();
  if (!hhmm) {
    d.setHours(9, 30, 0, 0);
    return d;
  }
  const [h, m] = hhmm.split(':').map((n) => Number(n));
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

const styles = StyleSheet.create({
  botAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  timeChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  appIcon: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
