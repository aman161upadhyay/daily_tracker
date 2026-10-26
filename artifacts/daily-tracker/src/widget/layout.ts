/**
 * How many tiles fit and how big the rings are for a given widget size (dp).
 * Pure so the breakpoints are tested; `TrackerWidget` only draws the result.
 */

export const WIDGET_PADDING = 12;
export const TILE_GAP = 8;

export interface WidgetLayout {
  /** `stacked` = ring above the text (2×2, 4×2); `inline` = ring beside the text (one-row widgets). */
  mode: 'stacked' | 'inline';
  /** Tiles that fit. */
  shown: number;
  ring: number;
  valueSize: number;
  nameSize: number;
  captionSize: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function widgetLayout(width: number, height: number, tileCount: number): WidgetLayout {
  const columns = width < 150 ? 1 : width < 230 ? 2 : 3;
  const shown = Math.max(0, Math.min(tileCount, columns));
  const inline = height < 110;
  const innerWidth = width - 2 * WIDGET_PADDING - Math.max(0, shown - 1) * TILE_GAP;
  const perTile = shown > 0 ? innerWidth / shown : innerWidth;

  if (inline) {
    const ring = clamp(Math.min(height - 2 * WIDGET_PADDING, perTile * 0.45), 36, 72);
    return { mode: 'inline', shown, ring, valueSize: clamp(Math.round(ring * 0.26), 11, 20), nameSize: 12, captionSize: 10 };
  }
  const ring = clamp(Math.min(perTile - 8, height - 2 * WIDGET_PADDING - 38), 40, 104);
  return {
    mode: 'stacked',
    shown,
    ring,
    valueSize: clamp(Math.round(ring * 0.24), 11, 26),
    nameSize: ring >= 80 ? 14 : 12,
    captionSize: ring >= 80 ? 12 : 10,
  };
}
