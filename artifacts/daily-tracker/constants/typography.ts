/**
 * Type scale from docs/DESIGN_SYSTEM.md §3. One family: Manrope.
 * Numbers use tabular figures (fontVariant) so metrics do not jitter.
 */
import type { TextStyle } from 'react-native';

export const FONTS = {
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

export type TypeRole = 'display' | 'largeTitle' | 'title1' | 'title2' | 'body' | 'callout' | 'footnote' | 'caption';

export const TYPE: Record<TypeRole, TextStyle> = {
  display: { fontFamily: FONTS.extrabold, fontSize: 40, lineHeight: 44, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  largeTitle: { fontFamily: FONTS.extrabold, fontSize: 32, lineHeight: 38, letterSpacing: -0.3 },
  title1: { fontFamily: FONTS.bold, fontSize: 22, lineHeight: 28 },
  title2: { fontFamily: FONTS.bold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: FONTS.medium, fontSize: 16, lineHeight: 22 },
  callout: { fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20 },
  footnote: { fontFamily: FONTS.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: FONTS.semibold, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
};

export const SPACE = {
  screen: 20,
  cardGap: 12,
  cardPad: 16,
} as const;
