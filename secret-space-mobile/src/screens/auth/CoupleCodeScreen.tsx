import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer, InlineHeader, Text, Button, Card } from '@/components';
import { useTheme } from '@/theme';
import { useAuth } from '@/context/AuthContext';
import { settingsApi } from '@/api';
import { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'CoupleCode'>;

export function CoupleCodeScreen({}: Props) {
  const theme = useTheme();
  const { user, refreshProfile } = useAuth();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const code = user?.coupleCode ?? '------';

  const onCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onShare = async () => {
    await Share.share({ message: `Join me on The Secret Space. Use this code: ${code}` });
  };

  return (
    <ScreenContainer scroll={false}>
      <InlineHeader
        title="Your code"
        showBack
        rightActions={[{ icon: 'info', onPress: () => {} }]}
      />
      <ScrollView
        contentContainerStyle={[styles.wrap, { paddingHorizontal: theme.screenPadding, paddingBottom: 48 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <LinearGradient
            colors={['rgba(232,99,122,0.18)', 'rgba(201,169,110,0.16)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 28 }]}
          />
          <View
            style={[
              styles.heroBorder,
              { borderColor: 'rgba(232,99,122,0.32)', borderRadius: 28 },
            ]}
          />
          <Text variant="overline" color="muted">
            Your couple code
          </Text>
          <Text variant="monoLarge" align="center" style={{ marginTop: 16 }}>
            {code}
          </Text>
          <Pressable
            onPress={onCopy}
            style={[
              styles.copyPill,
              { backgroundColor: theme.colors.glassStrong, borderColor: theme.colors.hairlineStrong },
            ]}
          >
            <Feather
              name={copied ? 'check' : 'copy'}
              size={14}
              color={copied ? theme.colors.success : theme.colors.foreground}
            />
            <Text
              variant="caption"
              style={{ color: copied ? theme.colors.success : theme.colors.foreground, marginLeft: 6 }}
              weight="semibold"
            >
              {copied ? 'COPIED' : 'TAP TO COPY'}
            </Text>
          </Pressable>
        </View>

        <Card style={{ marginTop: 16 }}>
          <Text variant="bodyMedium">Share this with your partner</Text>
          <Text variant="bodySmall" color="muted" style={{ marginTop: 4 }}>
            They'll enter it on their device to link your spaces.
          </Text>
        </Card>

        <View style={{ marginTop: 32 }}>
          <Button label="Share code" leadingIcon="share" fullWidth onPress={onShare} />
          <Button
            label="Continue without partner"
            variant="ghost"
            style={{ marginTop: 12 }}
            fullWidth
            onPress={() => settingsApi.getProfile().then(({ user: u }) => u && refreshProfile())}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 32 },
  heroCard: {
    borderRadius: 28,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroBorder: { ...StyleSheet.absoluteFillObject, borderWidth: 1 },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 1,
  },
});
