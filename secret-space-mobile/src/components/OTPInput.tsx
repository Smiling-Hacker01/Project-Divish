import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './Text';

interface Props {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  uppercase?: boolean;
  error?: boolean;
  numerals?: 'digit' | 'alphanumeric';
  serif?: boolean;
}

export function OTPInput({
  length = 6,
  value,
  onChange,
  autoFocus = true,
  uppercase = false,
  error = false,
  numerals = 'digit',
  serif = true,
}: Props) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (autoFocus) setTimeout(() => inputRef.current?.focus(), 200);
  }, [autoFocus]);

  const chars = value.padEnd(length, ' ').slice(0, length).split('');

  const handle = (text: string) => {
    let cleaned = text.replace(numerals === 'digit' ? /[^0-9]/g : /[^a-zA-Z0-9]/g, '');
    if (uppercase) cleaned = cleaned.toUpperCase();
    onChange(cleaned.slice(0, length));
  };

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.row}>
      {chars.map((c, i) => {
        const isActive = focused && i === value.length;
        const filled = c.trim().length > 0;
        const borderColor = error
          ? 'rgba(232,99,122,0.65)'
          : isActive
            ? theme.colors.primary
            : theme.colors.hairline;
        return (
          <View
            key={i}
            style={[
              styles.tile,
              {
                backgroundColor: theme.colors.surface,
                borderColor,
                borderWidth: isActive || error ? 2 : 1,
              },
            ]}
          >
            <Text
              variant={serif ? 'h3' : 'bodyMedium'}
              style={{
                color: filled ? theme.colors.foreground : 'transparent',
                fontSize: 22,
              }}
            >
              {c.trim() || '0'}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType={numerals === 'digit' ? 'number-pad' : 'default'}
        autoCapitalize={uppercase ? 'characters' : 'none'}
        autoCorrect={false}
        textContentType={numerals === 'digit' ? 'oneTimeCode' : 'none'}
        maxLength={length}
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  tile: {
    width: 48,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
});
