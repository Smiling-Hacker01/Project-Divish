import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, InlineHeader, Text, Button, Input, toast } from '@/components';
import { useTheme } from '@/theme';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/api';
import { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'InvitePartner'>;

/**
 * InvitePartnerScreen — sits between CoupleCodeScreen and Home, gives the
 * initiator two friendlier ways to deliver their couple code than the bare
 * native share sheet:
 *
 *   1. EMAIL  — types partner's address, taps Send, the backend ships the
 *               branded `inviteEmail` template with the code + app download
 *               instruction. The send is rate-limited backend-side (5/24h
 *               per couple, 1/24h per recipient) so accidental double-taps
 *               or typo-retries can't spam.
 *
 *   2. WHATSAPP — opens https://wa.me with a pre-filled message containing
 *               the inviter's name, the couple code, and a download nudge.
 *               WhatsApp launches with the message ready in its compose
 *               field; the inviter just picks the contact and hits send.
 *               No backend involvement — purely a deep-link launch.
 *
 * "Skip for now" routes back to CoupleCodeScreen so the user can still use
 * the legacy native-share button or continue without inviting. Nothing on
 * this screen blocks the rest of the app — the partner-pairing flow stays
 * exactly as it was, this screen is purely additive convenience.
 */
export function InvitePartnerScreen({ navigation }: Props) {
  const theme = useTheme();
  const { user } = useAuth();
  const code = user?.coupleCode ?? '';

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const onSendEmail = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    // Soft client-side email sanity check so we don't bounce off the
    // backend for an obvious typo. The backend re-validates via Zod.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("That doesn't look like an email address.");
      return;
    }
    setSending(true);
    try {
      await authApi.sendInvite(trimmed);
      setSentTo(trimmed);
      toast.success(`Invitation sent to ${trimmed}.`);
    } catch (err: any) {
      // The backend returns specific error strings for: not-creator, already-
      // joined, self-invite, rate-limited, send-failed. Surface them
      // verbatim — they're already in-voice from the controller copy.
      const msg = err?.response?.data?.error ?? "Couldn't send the invitation. Try again in a moment.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const onShareWhatsApp = async () => {
    if (!code) return;
    // wa.me opens WhatsApp with the text pre-filled in its compose field.
    // We use encodeURIComponent on the whole text so emoji + newlines survive
    // the URL. WhatsApp will surface a contact picker; once the inviter
    // selects their partner, the message is ready to send with one tap.
    // Mirror the email template's instruction: direct the partner to the
    // "Join with a code" button on the splash screen rather than the
    // "Create our space" path. Without this hint they could easily start
    // a brand-new couple instead of joining ours, which would create a
    // dangling couple row and a confused phone call.
    const text =
      `Hey, I set up a space for us on Secret Space.\n\n` +
      `Use this code to join: ${code}\n\n` +
      `(Download Secret Space, tap "Join with a code" on the first screen, and enter the code above.)`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    const supported = await Linking.canOpenURL(waUrl).catch(() => false);
    if (!supported) {
      toast.error("Couldn't open WhatsApp. Make sure it's installed.");
      return;
    }
    await Linking.openURL(waUrl).catch(() => {
      toast.error("Couldn't open WhatsApp.");
    });
  };

  const onDone = () => navigation.goBack();

  return (
    <ScreenContainer scroll={false}>
      <InlineHeader title="Invite your partner" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.wrap, { paddingHorizontal: theme.screenPadding }]}>
          {/* Hero — sets the tone, explains what this screen actually does
              so the user doesn't second-guess which path to take. */}
          <View style={styles.hero}>
            <LinearGradient
              colors={['rgba(232,99,122,0.18)', 'rgba(201,169,110,0.16)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
            />
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                { borderWidth: 1, borderColor: 'rgba(232,99,122,0.32)', borderRadius: 28 },
              ]}
            />
            <View style={styles.heroIconWrap}>
              <Feather name="send" size={22} color={theme.colors.primary} />
            </View>
            <Text variant="h2" align="center" style={{ marginTop: 16 }}>
              Send them an invitation
            </Text>
            <Text
              variant="bodySmall"
              color="muted"
              align="center"
              style={{ marginTop: 8, lineHeight: 20 }}
            >
              We'll send a warm note with your code and how to join. Or share through WhatsApp if that's easier.
            </Text>
          </View>

          {/* Email path. Disabled (and the input greys out) after a
              successful send so the user can't accidentally re-send. The
              backend rate-limit would catch it anyway but the UI hint is
              friendlier than a toast surfacing the 429. */}
          <View style={{ marginTop: 28 }}>
            <Text variant="overline" color="muted" style={{ marginBottom: 10 }}>
              By Email
            </Text>
            <Input
              label="Partner's email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!sending && !sentTo}
              placeholder="them@example.com"
            />
            <Button
              label={sentTo ? `Sent to ${sentTo}` : 'Send invitation'}
              leadingIcon={sentTo ? 'check' : 'mail'}
              fullWidth
              style={{ marginTop: 14 }}
              onPress={onSendEmail}
              loading={sending}
              disabled={sending || !!sentTo || email.trim().length === 0}
            />
          </View>

          {/* WhatsApp path — always available, separate visual section so the
              two options read as parallel choices rather than one being
              primary. */}
          <View style={{ marginTop: 28 }}>
            <Text variant="overline" color="muted" style={{ marginBottom: 10 }}>
              Through WhatsApp
            </Text>
            <Pressable
              onPress={onShareWhatsApp}
              style={[
                styles.waButton,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
              ]}
            >
              <View style={[styles.waIcon, { backgroundColor: '#25D366' }]}>
                <Feather name="message-circle" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text variant="bodyMedium">Share via WhatsApp</Text>
                <Text variant="bodySmall" color="muted" style={{ marginTop: 2 }}>
                  Opens WhatsApp with the message ready.
                </Text>
              </View>
              <Feather name="arrow-up-right" size={16} color={theme.colors.muted} />
            </Pressable>
          </View>

          {/* Skip path — sits at the bottom so the user sees the active
              options first. After a successful email send the button label
              changes from "Skip for now" to "Done" since the work is done. */}
          <View style={{ marginTop: 'auto', paddingBottom: 24 }}>
            <Button
              label={sentTo ? 'Done' : 'Skip for now'}
              variant="ghost"
              fullWidth
              onPress={onDone}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 16 },
  hero: {
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  waIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
