/**
 * Today's pinned summary cards: which ones show and in what order. The list lives in
 * `Settings.pinned`; anything not in the table is dropped on read, so a hand-edited backup or an
 * older build's id never reaches the screen. Each card still needs its own data to show (a Water
 * card for someone who tracks only vitamins reads "0 of 0" — it is skipped); the list says what
 * the person wants, the screen adds what exists.
 */

export const PINNED_CARD_IDS = ['water', 'snacks', 'mind', 'cycle', 'steps', 'sleep'] as const;
export type PinnedCardId = (typeof PINNED_CARD_IDS)[number];

export interface PinnedCardMeta {
  title: string;
  /** What the card shows, for the picker. */
  detail: string;
  /** The cycle card has its own switch (cycle tracking is opt-in); the others have none. */
  needs?: 'cycle';
}

export const PINNED_CARD_META: Record<PinnedCardId, PinnedCardMeta> = {
  water: { title: 'Water', detail: 'Today\u2019s total, pace and a one-tap button' },
  snacks: { title: 'Movement snacks', detail: 'Snacks done against the target and the Sugar Shield' },
  mind: { title: 'Mind', detail: 'Minutes of meditation or breathing today' },
  cycle: { title: 'Cycle', detail: 'Cycle day, phase and the next period', needs: 'cycle' },
  steps: { title: 'Steps', detail: 'Today\u2019s steps from Health Connect, or the Steps habit' },
  sleep: { title: 'Sleep', detail: 'Last night\u2019s sleep from Health Connect' },
};

/** The ids a card list may carry; the rest is the person's choice. */
export const DEFAULT_PINNED: readonly PinnedCardId[] = ['water', 'snacks', 'mind', 'cycle'];

const KNOWN = new Set<string>(PINNED_CARD_IDS);

export function isPinnedCardId(id: unknown): id is PinnedCardId {
  return typeof id === 'string' && KNOWN.has(id);
}

/**
 * Known ids only, each once, in the order given. Not an array (a damaged file) → the default.
 * The cycle card is appended when missing: it was never in the list before the picker existed
 * (its own switch decides whether it shows), so an older saved list must not read as "cycle off".
 */
export function sanitizePinned(raw: unknown): PinnedCardId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_PINNED];
  const out: PinnedCardId[] = [];
  for (const id of raw) if (isPinnedCardId(id) && !out.includes(id)) out.push(id);
  if (!out.includes('cycle')) out.push('cycle');
  return out;
}

/** Turn a card on (appended last) or off (removed); the cycle card is never removed — it has its own switch. */
export function setPinned(list: readonly PinnedCardId[], id: PinnedCardId, on: boolean): PinnedCardId[] {
  const without = list.filter((x) => x !== id);
  if (id === 'cycle') return list.includes('cycle') ? [...list] : [...list, 'cycle'];
  return on ? [...without, id] : without;
}

/** Move a card one step up (-1) or down (+1) among the cards in the list; out of range is a no-op. */
export function movePinned(list: readonly PinnedCardId[], id: PinnedCardId, direction: -1 | 1): PinnedCardId[] {
  const from = list.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return [...list];
  const out = [...list];
  out.splice(from, 1);
  out.splice(to, 0, id);
  return out;
}

/** Whether a card is switched on in the list (the cycle card's switch is `settings.cycle.showOnToday`). */
export function isPinned(list: readonly PinnedCardId[], id: PinnedCardId): boolean {
  return list.includes(id);
}
