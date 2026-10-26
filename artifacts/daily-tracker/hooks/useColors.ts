import { createContext, useContext } from 'react';
import colors, { type Palette, type Scheme } from '@/constants/colors';

export type Colors = Palette & { radius: number; radiusInner: number };

const PALETTES: Record<Scheme, Colors> = {
  dark: { ...colors.dark, radius: colors.radius, radiusInner: colors.radiusInner },
  light: { ...colors.light, radius: colors.radius, radiusInner: colors.radiusInner },
};

/** Resolved colour scheme; provided by the root layout from `settings.theme` + the phone's setting. */
export const SchemeContext = createContext<Scheme>('dark');

export function useScheme(): Scheme {
  return useContext(SchemeContext);
}

/** Design tokens for the active theme (dark outside the provider, e.g. the error fallback). */
export function useColors(): Colors {
  return PALETTES[useContext(SchemeContext)];
}
