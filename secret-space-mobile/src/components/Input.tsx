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
 * Form input — optional static title above the field, vertically-centered native
 * placeholder inside.
 *
 * Why this layout:
 *
 *   - Single-line fields use a flex row (`flexDirection: 'row'`,
 *     `alignItems: 'center'`) with a fixed `height`. This makes the TextInput
 *     a row child that React Native aligns *deterministically* in the vertical
 *     center, regardless of platform / font-metric quirks. The earlier approach
 *     used `minHeight` + `justifyContent` + an auto-sized TextInput which on
 *     Android rendered the placeholder at the top of the field because of
 *     line-box positioning rules.
 *
 *   - Multi-line fields use a column layout with symmetric `paddingVertical`
 *     so the text grows downward from the top edge naturally.
 *
 *   - `includeFontPadding: false` on Android strips the extra line-spacing
 *     padding that throws off vertical centering with Roboto / Inter.
 *
 *   - Trailing icons are inline children of the row (not absolute-positioned),
 *     so they participate in the same vertical centering and never overlap text.
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
          multiline ? styles.fieldMulti : styles.fieldRow,
          {
            backgroundColor: theme.colors.surface,
            borderColor,
            borderWidth: focused || error ? 1.5 : 1,
            // Multi-line grows with rows; single-line is fixed 54px for predictable
            // vertical alignment.
            ...(multiline
              ? { minHeight: 28 + rows * 22 }
              : { height: 54 }),
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
              ...(multiline
                ? {
                    textAlignVertical: 'top' as const,
                    minHeight: rows * 22,
                  }
                : null),
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
  // Single-line: row layout with vertical centering. TextInput is `flex: 1`
  // to fill the horizontal space, alignItems centers it vertically.
  fieldRow: {
    borderRadius: 14,
    paddingHorizontal: 16,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Multi-line: column layout with symmetric padding, TextInput grows downward.
  fieldMulti: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: '100%',
  },
  input: {
    // padding: 0 so the height/centering math isn't fighting with internal
    // TextInput padding. flex: 1 lets the input claim the row's remaining width.
    padding: 0,
    flex: 1,
  },
  trailing: {
    marginLeft: 8,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginLeft: 6 },
});
