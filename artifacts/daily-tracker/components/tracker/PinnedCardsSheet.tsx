import React from 'react';
import { Switch, View } from 'react-native';
import { UI } from '@/components/ui/icons';
import { Divider, IconButton, Row } from '@/components/ui/primitives';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { PINNED_CARD_IDS, PINNED_CARD_META, movePinned, setPinned, type PinnedCardId } from '@/src/domain/today/pinned';
import { useTracker } from '@/src/state/TrackerProvider';

export interface PinnedCardsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Which summary cards Today shows under "Pinned", and in what order. A card that is on still
 * needs something behind it (the Water habit, a movement habit, Health Connect data) to appear;
 * the sheet says so per row. The cycle card keeps its own switch (cycle tracking is opt-in).
 */
export function PinnedCardsSheet({ visible, onClose }: PinnedCardsSheetProps) {
  const c = useColors();
  const { state, actions } = useTracker();
  const s = state.settings;
  const list = s.pinned;
  const shown = list.filter((id) => id !== 'cycle' || s.cycleEnabled);
  const off = PINNED_CARD_IDS.filter((id) => !list.includes(id));
  const onFor = (id: PinnedCardId) => (id === 'cycle' ? s.cycle.showOnToday : list.includes(id));
  const toggle = (id: PinnedCardId, on: boolean) => {
    if (id === 'cycle') actions.updateCycle({ showOnToday: on });
    else actions.updateSettings({ pinned: setPinned(list, id, on) });
  };
  // Moves are among the rows on screen; a cycle entry hidden while cycle tracking is off keeps
  // out of the way (it re-appears last when tracking is turned on).
  const move = (id: PinnedCardId, direction: -1 | 1) => actions.updateSettings({ pinned: [...movePinned(shown, id, direction), ...list.filter((x) => !shown.includes(x))] });

  const row = (id: PinnedCardId, index: number, count: number, last: boolean) => {
    const meta = PINNED_CARD_META[id];
    const on = onFor(id);
    return (
      <View key={id}>
        <Row gap={8} style={{ alignItems: 'center', paddingVertical: 10 }}>
          <View style={{ flex: 1 }}>
            <Txt role="title2">{meta.title}</Txt>
            <Txt role="footnote" tone="secondary">
              {meta.detail}
            </Txt>
          </View>
          {on && count > 1 ? (
            <>
              <IconButton Glyph={UI.ArrowUp} label={`Move ${meta.title} up`} onPress={() => move(id, -1)} size={40} color={index > 0 ? c.text : c.textTertiary} disabled={index <= 0} />
              <IconButton Glyph={UI.ArrowDown} label={`Move ${meta.title} down`} onPress={() => move(id, 1)} size={40} color={index < count - 1 ? c.text : c.textTertiary} disabled={index >= count - 1} />
            </>
          ) : null}
          <Switch value={on} onValueChange={(v) => toggle(id, v)} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel={`Show ${meta.title} on Today`} />
        </Row>
        {last ? null : <Divider />}
      </View>
    );
  };

  return (
    <Sheet visible={visible} title="Cards on Today" onClose={onClose}>
      <Txt role="footnote" tone="secondary" style={{ marginBottom: 4 }}>
        Pick the summary cards under Pinned and their order. A card shows once it has something to show — the Water card needs the Water habit, Steps and Sleep need Health Connect (or the Steps habit).
      </Txt>
      {shown.map((id, i) => row(id, i, shown.length, i === shown.length - 1 && off.length === 0))}
      {off.length > 0 ? (
        <>
          <Txt role="caption" tone="tertiary" style={{ marginTop: 12, marginBottom: 2 }}>
            NOT SHOWN
          </Txt>
          {off.map((id, i) => row(id, -1, 0, i === off.length - 1))}
        </>
      ) : null}
    </Sheet>
  );
}
