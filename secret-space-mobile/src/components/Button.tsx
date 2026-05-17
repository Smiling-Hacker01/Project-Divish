import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  fullWidth?: boolean;
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  trailingIcon?: keyof typeof Feather.glyphMap;
  leadingIcon?: keyof typeof Feather.glyphMap;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  fullWidth,
  size = 'md',
  loading,
  disabled,
  trailingIcon,
  leadingIcon,
  style,
}: Props) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const height = size === 'sm' ? 40 : 56;
  const radius = size === 'sm' ? theme.radii.sm : theme.radii.md;
  const paddingH = size === 'sm' ? theme.spacing.md : theme.spacing.xl;

  const baseStyle: ViewStyle = {
    height,
    borderRadius: radius,
    paddingHorizontal: paddingH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: fullWidth ? '100%' : undefined,
    opacity: isDisabled ? (variant === 'primary' ? 0.4 : 0.5) : 1,
  };

  if (variant === 'primary' || variant === 'destructive') {
    const colors =
      variant === 'destructive'
        ? (['#E8637A', '#C76B70'] as const)
        : (theme.gradientStops as unknown as readonly [string, string]);
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          { transform: [{ scale: pressed ? 0.98 : 1 }] },
          !isDisabled && theme.shadows.glow,
          style,
        ]}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[baseStyle, { backgroundColor: theme.colors.primary }]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ButtonInner label={label} leadingIcon={leadingIcon} trailingIcon={trailingIcon} color="#FFFFFF" />
          )}
        </LinearGradient>
      </Pressable>
    );
  }

  if (variant === 'secondary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          baseStyle,
          {
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.hairlineStrong,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.foreground} />
        ) : (
          <ButtonInner
            label={label}
            leadingIcon={leadingIcon}
            trailingIcon={trailingIcon}
            color={theme.colors.foreground}
          />
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [baseStyle, { transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}
    >
      <ButtonInner
        label={label}
        leadingIcon={leadingIcon}
        trailingIcon={trailingIcon}
        color={theme.colors.primary}
      />
    </Pressable>
  );
}

function ButtonInner({
  label,
  leadingIcon,
  trailingIcon,
  color,
}: {
  label: string;
  leadingIcon?: keyof typeof Feather.glyphMap;
  trailingIcon?: keyof typeof Feather.glyphMap;
  color: string;
}) {
  return (
    <View style={styles.row}>
      {leadingIcon && <Feather name={leadingIcon} size={18} color={color} style={{ marginRight: 8 }} />}
      <Text variant="button" style={{ color }}>
        {label}
      </Text>
      {trailingIcon && <Feather name={trailingIcon} size={18} color={color} style={{ marginLeft: 8 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
