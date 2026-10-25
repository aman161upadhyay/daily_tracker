/**
 * Design tokens — the only source of color in the app.
 * Mirrors docs/DESIGN_SYSTEM.md §2. Dark theme is the default; light tokens
 * are defined so the switch later is a one-line change in useColors().
 *
 * Scaffold alias keys (background, foreground, card, primary, border, …) are
 * kept so the shared ErrorFallback keeps working.
 */

const brand = {
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
} as const;

const category = {
  hydration: '#5CD3C0',
  movement: '#1DB954',
  mind: '#B8A1F5',
  cycle: '#E59AB7',
  body: '#E6C76A',
  fuel: '#F0A35E',
} as const;

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

const light: typeof dark = {
  ...dark,
  bg: '#F5F7F6',
  surface: '#FFFFFF',
  surfaceRaised: '#EEF2EF',
  hairline: '#DCE3DF',
  text: '#0D120F',
  textSecondary: '#4F5B55',
  textTertiary: '#7B877F',
  onGreen: '#0D120F',
  goldFrame: 'rgba(184, 151, 63, 0.7)',
  goldFrameInner: 'rgba(184, 151, 63, 0.15)',
  scrim: 'rgba(0, 0, 0, 0.4)',
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

export default colors;
