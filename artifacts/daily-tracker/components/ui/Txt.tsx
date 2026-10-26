import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { TYPE, type TypeRole } from '@/constants/typography';
import { useColors, type Colors } from '@/hooks/useColors';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'green' | 'gold' | 'violet' | 'danger' | 'onGreen';

export interface TxtProps extends Omit<TextProps, 'role'> {
  role?: TypeRole;
  tone?: Tone;
  color?: string;
  align?: TextStyle['textAlign'];
  /** A real heading (a screen or section title), so a screen reader can jump between them. `role` is only typography. */
  heading?: boolean;
}

function toneColor(c: Colors, tone: Tone): string {
  switch (tone) {
    case 'secondary':
      return c.textSecondary;
    case 'tertiary':
      return c.textTertiary;
    case 'green':
      return c.greenBright;
    case 'gold':
      return c.goldBright;
    case 'violet':
      return c.violetSoft;
    case 'danger':
      return c.danger;
    case 'onGreen':
      return c.onGreen;
    default:
      return c.text;
  }
}

/**
 * How far the phone's font-size setting may enlarge each role. Body copy
 * scales fully; display numbers and titles sit in fixed-size rings, tiles and
 * rows, so they stop earlier instead of clipping.
 */
const MAX_SCALE: Record<TypeRole, number> = {
  display: 1.3,
  largeTitle: 1.4,
  title1: 1.6,
  title2: 1.8,
  body: 2,
  callout: 2,
  footnote: 2,
  caption: 2,
};

export function Txt({ role = 'body', tone = 'primary', color, align, style, maxFontSizeMultiplier, heading, ...rest }: TxtProps) {
  const c = useColors();
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_SCALE[role]}
      {...(heading ? { accessibilityRole: 'header' as const } : {})}
      {...rest}
      style={[TYPE[role], { color: color ?? toneColor(c, tone), textAlign: align }, style]}
    />
  );
}
