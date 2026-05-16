import React, { useRef, useState, forwardRef } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  Animated,
  Easing,
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

export const Input = forwardRef<TextInput, Props>(function Input(
  {
    label,
    error,
    trailingIcon,
    onTrailingPress,
    containerStyle,
    multiline,
    rows = 4,
    value,
    onFocus,
    onBlur,
    placeholder,
    ...rest
  },
  ref
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const labelAnim = useRef(new Animated.Value(value && value.length > 0 ? 1 : 0)).current;

  const animateLabel = (toValue: number) => {
    Animated.timing(labelAnim, {
      toValue,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  };

  const showFloated = focused || (value && value.length > 0);
  React.useEffect(() => {
    animateLabel(showFloated ? 1 : 0);
  }, [showFloated]);

  const minHeight = multiline ? 56 + rows * 14 : 56;
  const borderColor = error
    ? 'rgba(232,99,122,0.65)'
    : focused
      ? theme.colors.primary
      : theme.colors.hairline;

  const labelTop = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 8] });
  const labelSize = labelAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 12] });

  return (
    <View style={[{ width: '100%' }, containerStyle]}>
      <View
        style={[
          styles.field,
          {
            minHeight,
            backgroundColor: theme.colors.surface,
            borderColor,
            borderWidth: focused || error ? 1.5 : 1,
            paddingTop: label ? 22 : 16,
            paddingBottom: 12,
          },
        ]}
      >
        {label && (
          <Animated.Text
            style={[
              styles.label,
              {
                color: error
                  ? theme.colors.destructive
                  : focused
                    ? theme.colors.primary
                    : theme.colors.muted,
                top: labelTop,
                fontSize: labelSize,
                fontFamily: theme.typography.label.fontFamily,
              },
            ]}
          >
            {label}
          </Animated.Text>
        )}
        <TextInput
          ref={ref}
          value={value}
          {...rest}
          multiline={multiline}
          // Only show the textinput's own placeholder once the label has lifted out of the way,
          // otherwise the floating label and the placeholder render in the same vertical slot.
          placeholder={label && !showFloated ? undefined : placeholder}
          style={[
            styles.input,
            {
              color: theme.colors.foreground,
              fontFamily: theme.typography.body.fontFamily,
              fontSize: 16,
              textAlignVertical: multiline ? 'top' : 'center',
              minHeight: multiline ? rows * 22 : 22,
            },
          ]}
          placeholderTextColor={theme.colors.muted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
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
  field: {
    borderRadius: 16,
    paddingHorizontal: 16,
    width: '100%',
    justifyContent: 'center',
  },
  label: { position: 'absolute', left: 16, pointerEvents: 'none' },
  input: { paddingRight: 32, padding: 0 },
  trailing: { position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginLeft: 6 },
});
