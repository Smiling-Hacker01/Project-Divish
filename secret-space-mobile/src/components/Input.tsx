import React, { useState, forwardRef } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { Text } from './Text';

interface Props extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  trailingIcon?: keyof typeof Feather.glyphMap;
  onTrailingPress?: () => void;
  containerStyle?: ViewStyle;
  multiline?: boolean;
  rows?: number;
}

/**
 * Form input with an optional static title above the field and a vertically-
 * centered native placeholder inside it.
 *
 * Why not a floating label: the old implementation animated `label` from the
 * field's center up to a small position at the top edge. The math never quite
 * landed — the unfloated label and the typed text sat at different vertical
 * positions, and the field had to be tall enough (56px) to accommodate the
 * floated state at the top, which left an awkward gap below the floated label
 * once focused. Native `TextInput placeholder` is perfectly centered, so the
 * cleaner approach is:
 *
 *   - When `label` is provided, render it as a small static title ABOVE the
 *     field. Doesn't move, doesn't animate.
 *   - The field itself uses TextInput's native `placeholder` which Android +
 *     iOS both center vertically for free.
 *
 * Field height drops from 56 → 52, padding becomes symmetric, and
 * `includeFontPadding: false` on Android removes the extra line-height padding
 * that pushes text slightly off-center on Samsung One UI builds.
 */
export const Input = forwardRef<TextInput, Props>(function Input(
  {
    label,
    error,
    trailingIcon,
    onTrailingPress,
    containerStyle,
    multiline,
    rows = 4,
    placeholder,
    onFocus,
    onBlur,
    ...rest
  },
  ref
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const minHeight = multiline ? 24 + rows * 22 : 52;
  const borderColor = error
    ? 'rgba(232,99,122,0.65)'
    : focused
      ? theme.colors.primary
      : theme.colors.hairline;

  return (
    <View style={[{ width: '100%' }, containerStyle]}>
      {label && (
        <Text
          variant="bodySmall"
          color={error ? 'destructive' : focused ? 'primary' : 'muted'}
          style={styles.title}
        >
          {label}
        </Text>
      )}
      <View
        style={[
          styles.field,
          {
            minHeight,
            backgroundColor: theme.colors.surface,
            borderColor,
            borderWidth: focused || error ? 1.5 : 1,
            paddingVertical: multiline ? 14 : 0,
          },
        ]}
      >
        <TextInput
          ref={ref}
          multiline={multiline}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.muted}
          style={[
            styles.input,
            {
              color: theme.colors.foreground,
              fontFamily: theme.typography.body.fontFamily,
              fontSize: 16,
              textAlignVertical: multiline ? 'top' : 'center',
              minHeight: multiline ? rows * 22 : undefined,
              // Strips Android's extra line-spacing padding so the text and
              // placeholder land where we expect them. No-op on iOS.
              ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
            },
          ]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {trailingIcon && (
          <Pressable onPress={onTrailingPress} style={styles.trailing} hitSlop={8}>
            <Feather name={trailingIcon} size={20} color={theme.colors.muted} />
          </Pressable>
        )}
      </View>
      {error && (
        <View style={styles.errorRow}>
          <Feather name="alert-circle" size={12} color={theme.colors.destructive} />
          <Text variant="caption" color="destructive" style={{ marginLeft: 6 }}>
            {error}
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  title: { marginBottom: 6, marginLeft: 4 },
  field: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingRight: 44, // room for optional trailingIcon
    width: '100%',
    justifyContent: 'center',
  },
  input: {
    // padding:0 + symmetric vertical centering via the parent View's
    // justifyContent gives us a perfectly centered single line.
    padding: 0,
    width: '100%',
  },
  trailing: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    width: 32,
    alignItems: 'center',
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginLeft: 6 },
});
