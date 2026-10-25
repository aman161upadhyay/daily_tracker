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

export function Txt({ role = 'body', tone = 'primary', color, align, style, ...rest }: TxtProps) {
  const c = useColors();
  return <Text {...rest} style={[TYPE[role], { color: color ?? toneColor(c, tone), textAlign: align }, style]} />;
}
