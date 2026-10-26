/**
 * Design tokens — the only source of color in the app.
 * Mirrors docs/DESIGN_SYSTEM.md §2. Dark theme is the designed default; the
 * light palette is selected by `settings.theme` through useColors().
 *
 * Scaffold alias keys (background, foreground, card, primary, border, …) are
 * kept so the shared ErrorFallback keeps working.
 */

const brand: Record<'green' | 'greenBright' | 'greenDeep' | 'greenMist' | 'lime' | 'gold' | 'goldBright' | 'goldPale' | 'violet' | 'violetSoft' | 'plum' | 'danger', string> = {
  green: '#1DB954',
  greenBright: '#1ED760',
  greenDeep: '#128A3E',
  greenMist: '#8BE3A2',
  lime: '#D7E58C',
  gold: '#C9A84C',
  goldBright: '#E6C76A',
  goldPale: '#F2E3A9',
  violet: '#8B5CF6',
  violetSoft: '#B8A1F5',
  plum: '#5E35B1',
  danger: '#F26D6D',
};

const category: Record<'hydration' | 'movement' | 'mind' | 'cycle' | 'body' | 'fuel' | 'craft', string> = {
  hydration: '#5CD3C0',
  movement: '#1DB954',
  mind: '#B8A1F5',
  cycle: '#E59AB7',
  body: '#E6C76A',
  fuel: '#F0A35E',
  craft: '#D7E58C',
};

const dark = {
  bg: '#0D120F',
  surface: '#151B17',
  surfaceRaised: '#1C2420',
  hairline: '#2A3430',
  text: '#F3F6F2',
  textSecondary: '#AEB8B1',
  textTertiary: '#7B877F',
  /** Text on green buttons (white is only 2.9:1). */
  onGreen: '#0D120F',
  goldFrame: 'rgba(201, 168, 76, 0.7)',
  goldFrameInner: 'rgba(230, 199, 106, 0.2)',
  flowGlow: 'rgba(139, 92, 246, 0.25)',
  scrim: 'rgba(0, 0, 0, 0.6)',
  ...brand,
  cat: category,

  // scaffold aliases
  tint: '#1DB954',
  background: '#0D120F',
  foreground: '#F3F6F2',
  card: '#151B17',
  cardForeground: '#F3F6F2',
  primary: '#1DB954',
  primaryForeground: '#0D120F',
  secondary: '#1C2420',
  secondaryForeground: '#F3F6F2',
  muted: '#1C2420',
  mutedForeground: '#AEB8B1',
  accent: '#1C2420',
  accentForeground: '#F3F6F2',
  destructive: '#F26D6D',
  destructiveForeground: '#0D120F',
  border: '#2A3430',
  input: '#2A3430',
};

/**
 * Light theme (design system §2.5): same geometry, AA-safe inks. Tokens that
 * screens use for text and icons get deeper shades here; fills are tinted
 * through `withAlpha`, so the same deeper shades read as soft tints there.
 * Primary buttons become deep green with white text (dark text on #1DB954 is
 * fine, but #1DB954 text on white is only 2.9:1).
 */
const light: typeof dark = {
  ...dark,
  bg: '#F5F7F6',
  surface: '#FFFFFF',
  surfaceRaised: '#EEF2EF',
  hairline: '#DCE3DF',
  text: '#0D120F',
  textSecondary: '#4F5B55',
  textTertiary: '#6B776F',
  onGreen: '#FFFFFF',
  goldFrame: 'rgba(184, 151, 63, 0.7)',
  goldFrameInner: 'rgba(184, 151, 63, 0.15)',
  flowGlow: 'rgba(109, 63, 224, 0.15)',
  scrim: 'rgba(0, 0, 0, 0.4)',
  green: '#128A3E',
  // Text and icon inks: 6.3:1 (green) and 5.3:1 (gold) on the raised surface, where footnotes sit.
  // #16A34A reads as green on white but is 2.9:1 on #EEF2EF.
  greenBright: '#166534',
  greenMist: '#3B9D5D',
  lime: '#7A8A1F',
  gold: '#9A7A1F',
  goldBright: '#7A6016',
  goldPale: '#B8973F',
  violet: '#6D3FE0',
  violetSoft: '#6D3FE0',
  danger: '#C62828',
  cat: {
    hydration: '#13897A',
    movement: '#128A3E',
    mind: '#6D3FE0',
    cycle: '#C2487A',
    body: '#8A6D1C',
    fuel: '#B5541A',
    craft: '#6F7F14',
  },
  tint: '#128A3E',
  background: '#F5F7F6',
  foreground: '#0D120F',
  card: '#FFFFFF',
  cardForeground: '#0D120F',
  primary: '#128A3E',
  primaryForeground: '#FFFFFF',
  secondary: '#EEF2EF',
  secondaryForeground: '#0D120F',
  muted: '#EEF2EF',
  mutedForeground: '#4F5B55',
  accent: '#EEF2EF',
  accentForeground: '#0D120F',
  destructive: '#C62828',
  destructiveForeground: '#FFFFFF',
  border: '#DCE3DF',
  input: '#DCE3DF',
};

const colors = {
  light,
  dark,
  /** Card radius; nested elements use `radius.inner`, pills are fully round. */
  radius: 20,
  radiusInner: 12,
};

export type Palette = typeof dark;
export type CategoryKey = keyof typeof category;
export type Scheme = 'dark' | 'light';

export default colors;
