import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { Text } from './Text';
import { Button } from './Button';

interface Props {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  body?: string;
  cta?: { label: string; onPress: () => void };
}

export function EmptyState({ icon = 'box', title, body, cta }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Feather name={icon} size={56} color={theme.colors.muted} style={{ opacity: 0.6 }} />
      <Text variant="h3" align="center" style={{ marginTop: 24 }}>
        {title}
      </Text>
      {body && (
        <Text variant="body" color="muted" align="center" style={{ marginTop: 8, maxWidth: 280 }}>
          {body}
        </Text>
      )}
      {cta && (
        <View style={{ marginTop: 24 }}>
          <Button label={cta.label} onPress={cta.onPress} variant="ghost" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
