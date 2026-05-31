import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { ScreenContainer, InlineHeader, Text, Card, Button, SwitchRow } from '@/components';
import { useTheme } from '@/theme';
import { lovebotApi } from '@/api';
import { LoveBotSettings, LoveBotReason } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { loveBotInfo } from '@/copy';

// Partner's first name only — keeps the section header compact even when the
// stored partner name is "Vishal Singh Kushwaha" or similar. Falls back to a
// neutral pronoun so the screen never reads as broken before the auth profile
// has loaded.
function firstName(name: string | undefined | null): string {
  if (!name) return 'them';
  return name.trim().split(/\s+/)[0] || 'them';
}

// Reason row height + visible-row count drive the bounded FlatList container.
// 76dp/row gives 2 lines of body text + 12dp vertical padding; 3 rows visible
// keeps the queue prominent without dominating the screen, leaving the Add
// Reason button and Up Next card visible without scrolling on most phones.
const REASON_ROW_HEIGHT = 76;
const REASON_LIST_VISIBLE_ROWS = 3;

export function LoveBotScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [settings, setSettings] = useState<LoveBotSettings | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  // Per-row imperative handle into the Swipeable, used to programmatically
  // close any open row when the user taps elsewhere (e.g. when starting a
  // delete on a second row, the first one auto-closes).
  const swipeableRefs = useRef<Map<string, SwipeableMethods | null>>(new Map());

  const partnerFirstName = firstName(user?.partnerName);

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
      <InlineHeader
        title="Love Bot"
        rightActions={[{ icon: 'info', onPress: () => setInfoOpen(true) }]}
      />
      <ScrollView
        // Outer gap was 16dp — bumped to 20dp for a calmer vertical rhythm.
        // Major section breaks (Schedule → Partner Access → Queue → Up Next)
        // get an additional marginTop on their overline to push past this
        // baseline gap.
        contentContainerStyle={{
          paddingHorizontal: theme.screenPadding,
          paddingTop: 8,
          paddingBottom: theme.bottomNavReserve + 16,
          gap: 20,
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
                Your reasons, on a schedule.
              </Text>
              <Text variant="bodySmall" color="muted" style={{ marginTop: 4 }}>
                {loveBotInfo.intro}
              </Text>
            </View>
          </View>
        </Card>

        {/* ─── SCHEDULE ─────────────────────────────────────────────── */}
        <Text variant="overline" color="muted" style={styles.sectionOverline}>
          Schedule
        </Text>
        <View style={{ gap: 10 }}>
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

        {/* ─── PARTNER ACCESS ──────────────────────────────────────────
            Pulled out of the Schedule section because it isn't a schedule
            knob — it's a permission that affects who else can contribute
            to the queue. Inline variant of SwitchRow strips the card chrome
            so this row reads as "section content" rather than "another
            mode card", which was the source of the prior visual squeeze. */}
        <Text variant="overline" color="muted" style={styles.sectionOverline}>
          Partner access
        </Text>
        <SwitchRow
          variant="inline"
          label="Let them add reasons too"
          description="Your partner can drop reasons into the queue."
          value={settings?.userBAccessGranted ?? false}
          onValueChange={togglePartner}
        />

        {/* ─── YOU → {partner} (queue) ──────────────────────────────────
            Direction-aware section header. The bot you configure on this
            screen sends reasons FROM you TO your partner — making that
            direction explicit (rather than calling it generically "Your
            reasons") makes the queue's purpose obvious and pre-empts the
            most common confusion about why your own Home screen doesn't
            show what's in this list. */}
        <View style={[styles.sectionOverlineRow, styles.sectionOverline]}>
          <Text variant="overline" color="muted" style={{ flex: 1 }}>
            You → {partnerFirstName}
          </Text>
          <Text variant="caption" color="muted">
            {(settings?.reasons.length ?? 0) === 0
              ? 'EMPTY'
              : `${settings?.reasons.length} IN QUEUE`}
          </Text>
        </View>

        {/* Reasons queue — bounded-height FlatList so the section never grows
            past ~3 visible rows even as the queue scales. Outside the inner
            list, the page ScrollView keeps the schedule controls, Add Reason
            button, and Up Next preview reachable without paging through the
            queue.
            • nestedScrollEnabled is required on Android for the inner
              FlatList to take scroll gestures away from the outer ScrollView
              once finger contact lands inside the list's bounds.
            • scrollEnabled is toggled off when the queue fits comfortably to
              suppress a phantom "rubber band" feel on short lists. */}
        {(settings?.reasons?.length ?? 0) > 0 ? (
          <View
            style={[
              styles.reasonListWrap,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
            ]}
          >
            <FlatList
              data={settings?.reasons ?? []}
              keyExtractor={(r) => r.id}
              renderItem={({ item, index }) => (
                <ReasonRow
                  reason={item}
                  index={index}
                  total={settings?.reasons.length ?? 0}
                  onDelete={removeReason}
                  registerRef={(ref) => swipeableRefs.current.set(item.id, ref)}
                  onSwipeOpen={() => {
                    swipeableRefs.current.forEach((s, id) => {
                      if (id !== item.id) s?.close();
                    });
                  }}
                />
              )}
              ItemSeparatorComponent={() => (
                <View style={[styles.reasonSeparator, { backgroundColor: theme.colors.hairline }]} />
              )}
              style={styles.reasonList}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              scrollEnabled={(settings?.reasons.length ?? 0) > REASON_LIST_VISIBLE_ROWS}
            />
          </View>
        ) : (
          <View
            style={[
              styles.reasonEmptyWrap,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
            ]}
          >
            <Feather name="feather" size={20} color={theme.colors.muted} style={{ marginBottom: 8 }} />
            <Text variant="bodySmall" color="muted" align="center" style={{ lineHeight: 20 }}>
              The queue is empty. {partnerFirstName} will still get one at the scheduled time, written for you. Add your own to send something personal instead.
            </Text>
          </View>
        )}

        <Button label="Add a reason" leadingIcon="plus" fullWidth onPress={() => navigation.navigate('AddReason')} />

        {/* ─── UP NEXT ──────────────────────────────────────────────────
            Elevated the section label out of the card into a proper
            overline so it shares hierarchy with Schedule / Partner Access /
            queue header instead of looking like a card-internal caption.
            Backend already returns reasons[] filtered to unused + ordered
            ASC by createdAt, so reasons[0] is the actual next-to-deliver
            row. When the queue is empty we don't fabricate a preview —
            the cron will auto-generate a fresh Gemini line at delivery
            time and the user can't know its text in advance, so we
            surface that fact honestly. */}
        <Text variant="overline" color="muted" style={styles.sectionOverline}>
          Up next
        </Text>
        <Card variant="tinted-gold">
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={[styles.appIcon, { backgroundColor: theme.colors.surface, marginTop: 2 }]}>
              <Feather name="heart" size={14} color={theme.colors.primary} />
            </View>
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text variant="caption" color="muted">
                The Secret Space · {formatTime(settings?.time)}
              </Text>
              {settings?.reasons[0] ? (
                <Text
                  variant="bodySmall"
                  weight="medium"
                  style={{ marginTop: 4, lineHeight: 20 }}
                  numberOfLines={3}
                >
                  {settings.reasons[0].text}
                </Text>
              ) : (
                <Text
                  variant="bodySmall"
                  color="muted"
                  italic
                  style={{ marginTop: 4, lineHeight: 20 }}
                  numberOfLines={3}
                >
                  Your bot will write one when it's time. Add your own to override.
                </Text>
              )}
            </View>
          </View>
        </Card>
      </ScrollView>

      {/* Info modal — explains the Love Bot to first-time users. Tapped from the
          (i) button in the TopBar. Bottom-sheet style keeps it lightweight and
          dismissable with a tap on the scrim. */}
      <Modal
        visible={infoOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setInfoOpen(false)}
      >
        <Pressable style={styles.infoScrim} onPress={() => setInfoOpen(false)}>
          <Pressable
            onPress={() => {}}
            style={[styles.infoSheet, { backgroundColor: theme.colors.surface }]}
          >
            <View style={[styles.infoHandle, { backgroundColor: theme.colors.hairlineStrong }]} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <LinearGradient
                colors={theme.gradientStops as unknown as readonly [string, string]}
                style={styles.infoIcon}
              >
                <Feather name="message-circle" size={18} color="#fff" />
              </LinearGradient>
              <Text variant="h3" style={{ marginLeft: 12, flex: 1 }}>
                How Love Bot works
              </Text>
            </View>
            <Text variant="bodySmall" color="muted" style={{ marginBottom: 20 }}>
              {loveBotInfo.intro}
            </Text>

            <InfoRow icon="clock" title="Daily" body={loveBotInfo.modes.daily} />
            <InfoRow icon="star" title="Surprise" body={loveBotInfo.modes.surprise} />
            <InfoRow icon="users" title="Both can add" body={loveBotInfo.modes.contribute} />
            <InfoRow icon="bell" title="How it lands" body={loveBotInfo.modes.delivery} last />

            <Button
              label="Got it"
              fullWidth
              style={{ marginTop: 24 }}
              onPress={() => setInfoOpen(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

// ReasonRow — a single entry in the queue. The leading badge is the row's
// delivery order (1, 2, 3…), and on row 0 it becomes a rose-tinted "NEXT" pill
// to mirror what the Up Next card previews. Swipe-left reveals a destructive
// delete action; the trash icon is dropped from the row itself so the row
// stays visually clean.
//
// We use react-native-gesture-handler's ReanimatedSwipeable (not the legacy
// Swipeable) because the legacy component is deprecated as of gesture-handler
// 2.20 and emits a runtime warning every render. The reanimated variant has
// the same surface plus smoother transitions on the new Architecture.
function ReasonRow({
  reason,
  index,
  total,
  onDelete,
  registerRef,
  onSwipeOpen,
}: {
  reason: LoveBotReason;
  index: number;
  total: number;
  onDelete: (id: string) => void;
  registerRef: (ref: SwipeableMethods | null) => void;
  onSwipeOpen: () => void;
}) {
  const theme = useTheme();
  const isNext = index === 0;

  // The right-action panel that's revealed by the swipe gesture. We render
  // the delete affordance ourselves rather than relying on the default
  // styling so it matches the rest of the app's destructive-action treatment
  // (rose-tinted background, white icon, full-row-height alignment).
  const renderRightActions = () => (
    <Pressable
      onPress={() => onDelete(reason.id)}
      style={[styles.reasonDeleteAction, { backgroundColor: theme.colors.destructive }]}
      accessibilityRole="button"
      accessibilityLabel={`Delete reason ${index + 1} of ${total}`}
    >
      <Feather name="trash-2" size={18} color="#fff" />
      <Text variant="caption" style={{ color: '#fff', marginTop: 4 }} weight="semibold">
        Delete
      </Text>
    </Pressable>
  );

  return (
    <ReanimatedSwipeable
      ref={registerRef}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={onSwipeOpen}
      friction={2}
      rightThreshold={36}
      overshootRight={false}
    >
      <View style={[styles.reasonRow, { backgroundColor: theme.colors.surface }]}>
        {isNext ? (
          <View style={[styles.reasonBadgeNext, { backgroundColor: theme.colors.primary }]}>
            <Text variant="caption" weight="semibold" style={{ color: '#fff', fontSize: 10, letterSpacing: 0.5 }}>
              NEXT
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.reasonBadgeNumber,
              { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.hairline },
            ]}
          >
            <Text variant="caption" color="muted" weight="semibold">
              {index + 1}
            </Text>
          </View>
        )}
        <Text
          variant="serifBody"
          style={{ flex: 1, marginLeft: 12, fontSize: 15, lineHeight: 21 }}
          numberOfLines={2}
        >
          {reason.text}
        </Text>
      </View>
    </ReanimatedSwipeable>
  );
}

function InfoRow({
  icon,
  title,
  body,
  last,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.infoRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.hairline },
      ]}
    >
      <View
        style={[
          styles.infoRowIcon,
          { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.hairline },
        ]}
      >
        <Feather name={icon} size={16} color={theme.colors.foreground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium" weight="semibold">
          {title}
        </Text>
        <Text variant="bodySmall" color="muted" style={{ marginTop: 4 }}>
          {body}
        </Text>
      </View>
    </View>
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
  // Section overlines sit between the outer ScrollView's 20dp gap and the
  // section content. The extra marginTop of 8dp creates a clear 28dp
  // visual break between major sections (Schedule, Partner Access, Queue,
  // Up Next) without needing dividers — the labels themselves carry the
  // hierarchy.
  sectionOverline: {
    marginTop: 8,
  },
  sectionOverlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    // Tightened from 72 → 64 so the three stacked mode cards read lighter
    // and the whole Schedule section sits less heavy on the screen. With
    // the icon at 22 + 16dp paddingHorizontal + bodyMedium label + helper
    // bodySmall, 64dp is comfortable.
    minHeight: 64,
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
  reasonListWrap: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: REASON_ROW_HEIGHT * REASON_LIST_VISIBLE_ROWS,
  },
  reasonList: {
    flexGrow: 0,
  },
  reasonSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16 + 32 + 12, // align with text column: row padding + badge + gap
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: REASON_ROW_HEIGHT,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  reasonBadgeNext: {
    minWidth: 36,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonBadgeNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  reasonDeleteAction: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonEmptyWrap: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  appIcon: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  infoScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  infoSheet: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  infoHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginVertical: 12 },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
  },
  infoRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
});
