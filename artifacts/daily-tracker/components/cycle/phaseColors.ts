import type { CyclePhase } from '@/src/domain/cycle/timeline';
import { withAlpha } from '@/src/domain/color/oklch';

export interface PhasePalette {
  cycle: string;
  green: string;
  violet: string;
  gold: string;
  textTertiary: string;
}

/** One colour per phase: period = rose, fertile = green, luteal = violet, late-luteal = gold. */
export function phaseColor(phase: CyclePhase, c: PhasePalette): string {
  switch (phase) {
    case 'menstrual':
      return c.cycle;
    case 'fertile':
      return c.green;
    case 'luteal':
      return c.violet;
    case 'late-luteal':
      return c.gold;
    case 'follicular':
      return c.textTertiary;
  }
}

/** Calendar fill for a day: solid for logged, translucent for predicted, none for follicular. */
export function phaseFill(phase: CyclePhase, predicted: boolean, c: PhasePalette): string | undefined {
  if (phase === 'follicular') return undefined;
  const base = phaseColor(phase, c);
  return withAlpha(base, predicted ? 0.22 : 0.6);
}
