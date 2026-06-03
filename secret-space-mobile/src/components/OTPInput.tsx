import React, { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager, Pressable, StyleSheet, TextInput, View } from 'react-native';
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

  // Auto-focus AFTER the navigation transition finishes. The old code focused
  // on a blind 200ms timer, but under the new architecture (newArchEnabled)
  // the native-stack push animation often isn't done at 200ms — the focus
  // request lands on a still-transitioning view and the native keyboard never
  // comes up (the bug: tiles showed but the keyboard stayed hidden until the
  // user backgrounded + reopened the app, which re-issued focus to the now-
  // settled view). InteractionManager.runAfterInteractions waits for the
  // transition/animations to actually complete; the small trailing timeout
  // covers Android devices where the native view attaches a frame or two after
  // interactions report done.
  useEffect(() => {
    if (!autoFocus) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => inputRef.current?.focus(), 50);
    });
    return () => {
      task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [autoFocus]);

  // Tapping the tiles must reliably summon the keyboard. A bare focus() is a
  // no-op when React Native already believes the field is focused (its onFocus
  // fired during the transition) even though the keyboard isn't actually
  // showing — the exact stuck state above. So when we think we're focused, we
  // blur first and refocus on the next frame to force the keyboard up; only
  // when genuinely unfocused do we call focus() directly.
  const handlePress = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    if (focused) {
      input.blur();
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      input.focus();
    }
  }, [focused]);

  const chars = value.padEnd(length, ' ').slice(0, length).split('');

  const handle = (text: string) => {
    let cleaned = text.replace(numerals === 'digit' ? /[^0-9]/g : /[^a-zA-Z0-9]/g, '');
    if (uppercase) cleaned = cleaned.toUpperCase();
    onChange(cleaned.slice(0, length));
  };

  return (
    <Pressable onPress={handlePress} style={styles.row}>
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
