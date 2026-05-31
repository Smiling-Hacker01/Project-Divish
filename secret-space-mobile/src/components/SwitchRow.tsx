import React from 'react';
import { Pressable, StyleSheet, Switch, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

type Variant = 'card' | 'inline';

interface Props {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  style?: ViewStyle;
  /**
   * 'card' (default) renders the row inside a surface + hairline-border card,
   * matching the visual weight of a tap-target card.
   * 'inline' drops the card chrome entirely — used when the row sits in a
   * section that already has its own overline / section break and we don't
   * want the toggle to read as another tap-card. The inline variant pads
   * vertically instead of relying on the card's minHeight.
   */
  variant?: Variant;
}

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  style,
  variant = 'card',
}: Props) {
  const theme = useTheme();
  const isInline = variant === 'inline';
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={[
        isInline ? styles.inline : styles.card,
        !isInline && {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.hairline,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text variant="bodyMedium">{label}</Text>
        {description && (
          <Text variant="bodySmall" color="muted" style={{ marginTop: 2 }}>
            {description}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        thumbColor={'#fff'}
        trackColor={{ true: theme.colors.primary, false: theme.colors.hairlineStrong }}
        ios_backgroundColor={theme.colors.hairlineStrong}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  // Inline variant: no border, no surface bg, no horizontal padding. The
  // parent screen owns its margin/screenPadding so this row aligns with
  // section overlines above and below it.
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
});
