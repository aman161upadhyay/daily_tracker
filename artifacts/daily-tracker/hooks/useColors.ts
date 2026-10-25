import colors, { type Palette } from '@/constants/colors';

export type Colors = Palette & { radius: number; radiusInner: number };

/**
 * Design tokens for the active theme.
 *
 * Dark theme first (docs/DESIGN_SYSTEM.md): the light palette is defined but
 * not wired to the system setting until the dark theme is finished.
 */
export function useColors(): Colors {
  return { ...colors.dark, radius: colors.radius, radiusInner: colors.radiusInner };
}
