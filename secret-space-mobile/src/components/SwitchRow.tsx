import React from 'react';
import { Pressable, StyleSheet, Switch, View, ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

interface Props {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  style?: ViewStyle;
}

export function SwitchRow({ label, description, value, onValueChange, style }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={[
        styles.wrap,
        {
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
        thumbColor={value ? '#fff' : theme.scheme === 'dark' ? '#fff' : '#fff'}
        trackColor={{ true: theme.colors.primary, false: theme.colors.hairlineStrong }}
        ios_backgroundColor={theme.colors.hairlineStrong}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
});
