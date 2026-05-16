import React from 'react';
import { Platform, Text as RNText, TextProps, TextStyle } from 'react-native';

interface Props extends TextProps {
  size?: number;
}

/**
 * Renders an emoji without forcing a non-emoji `fontFamily` from our typography
 * scale (which causes iOS to clip the glyph when the parent line-height is
 * smaller than the requested fontSize). Always pass an explicit `size`.
 */
export function Emoji({ size = 24, style, children, ...rest }: Props) {
  const computed: TextStyle = {
    fontSize: size,
    // iOS uses ~1.2x for emoji glyphs; bump line-height to fully contain them.
    lineHeight: Math.round(size * 1.2),
    // Don't inherit a fontFamily from parent <Text>; let the OS pick the emoji font.
    fontFamily: Platform.select({ ios: undefined, android: undefined, default: undefined }),
    includeFontPadding: false as any,
    textAlignVertical: 'center' as any,
  };
  return (
    <RNText {...rest} allowFontScaling={false} style={[computed, style]}>
      {children}
    </RNText>
  );
}
