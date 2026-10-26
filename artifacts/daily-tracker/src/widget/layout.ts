/**
 * How many tiles fit and how big the rings are for a given widget size (dp).
 * Pure so the breakpoints are tested; `TrackerWidget` only draws the result.
 *
 * Two things the launcher never tells the drawing code are budgeted here: the
 * person's font scale (labels are sp and grow with it; the ring is dp and does
 * not), and the 48 dp Android asks of anything tappable — the ring and the
 * label block are two different taps, so each gets at least that.
 */

export const TILE_GAP = 8;
/** Smallest tappable ring / label block (Android's touch-target minimum). */
export const MIN_TOUCH = 48;
const MAX_RING = 104;
/** Rough line height of a label at 1× font scale, as a multiple of its font size (Android adds font padding). */
const LINE = 1.3;

export interface WidgetLayout {
  /** `stacked` = ring above the text (2×2, 4×2); `inline` = ring beside the text (one-row widgets). */
  mode: 'stacked' | 'inline';
  /** Tiles that fit. */
  shown: number;
  ring: number;
  /** Frame padding, shrunk on very short widgets so a 48 dp ring still fits. */
  padding: number;
  /** Height reserved for the name + caption block under a stacked ring (≥ `MIN_TOUCH`, grows with the font scale). */
  labelBlock: number;
  /** dp: the value sits inside a dp-sized ring and is never font-scaled. */
  valueSize: number;
  /** sp: labels scale with the system setting. */
  nameSize: number;
  captionSize: number;
  /** Room for a small day label above the tiles (stacked widgets with height to spare). */
  showDay: boolean;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Height a name + caption pair takes at this font scale, margins included. */
export function labelBlockHeight(nameSize: number, captionSize: number, fontScale: number): number {
  const text = (nameSize + captionSize) * LINE * Math.max(1, fontScale);
  return Math.max(MIN_TOUCH, Math.ceil(text + 6 + 1));
}

export function widgetLayout(width: number, height: number, tileCount: number, fontScale = 1): WidgetLayout {
  const columns = width < 150 ? 1 : width < 230 ? 2 : 3;
  const shown = Math.max(0, Math.min(tileCount, columns));
  const padding = height < 80 ? 6 : 12;
  const innerWidth = width - 2 * padding - Math.max(0, shown - 1) * TILE_GAP;
  const perTile = shown > 0 ? innerWidth / shown : innerWidth;

  const smallLabels = labelBlockHeight(12, 10, fontScale);
  // Stacked needs a tappable ring *and* a tappable label block one above the other; otherwise side by side.
  const inline = height - 2 * padding < MIN_TOUCH + smallLabels;

  if (inline) {
    const ring = clamp(Math.min(height - 2 * padding, perTile * 0.45), MIN_TOUCH, 72);
    return { mode: 'inline', shown, ring, padding, labelBlock: Math.max(MIN_TOUCH, height - 2 * padding), valueSize: clamp(Math.round(ring * 0.26), 11, 20), nameSize: 12, captionSize: 10, showDay: false };
  }
  const dayLine = Math.ceil(10 * LINE * Math.max(1, fontScale)) + 2;
  let nameSize = 14;
  let captionSize = 12;
  let labelBlock = labelBlockHeight(nameSize, captionSize, fontScale);
  const ringFor = (labels: number, reserved: number) => clamp(Math.min(perTile - 8, height - 2 * padding - labels - reserved), MIN_TOUCH, MAX_RING);
  let ring = ringFor(labelBlock, 0);
  if (ring < 80) {
    nameSize = 12;
    captionSize = 10;
    labelBlock = smallLabels;
    ring = ringFor(labelBlock, 0);
  }
  // The day line is worth having unless it costs ring size a thumb would notice (under 72 dp).
  const withDay = ringFor(labelBlock, dayLine);
  const showDay = withDay >= Math.min(72, ring) && height - 2 * padding - labelBlock - withDay >= dayLine;
  if (showDay) ring = withDay;
  return {
    mode: 'stacked',
    shown,
    ring,
    padding,
    labelBlock,
    valueSize: clamp(Math.round(ring * 0.24), 11, 26),
    nameSize,
    captionSize,
    showDay,
  };
}

/**
 * Font size (dp) that lets `text` fit inside a ring of `inner` dp: the layout's size when it
 * fits, smaller when a long value ("12,500") would otherwise be cut to "12,5…".
 */
export function fitValueSize(text: string, inner: number, preferred: number): number {
  const perChar = 0.62; // Manrope ExtraBold digits, roughly
  const needed = Math.max(1, text.length) * perChar * preferred;
  if (needed <= inner) return preferred;
  return Math.max(9, Math.floor((preferred * inner) / needed));
}
