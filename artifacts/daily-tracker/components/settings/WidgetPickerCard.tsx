import React from 'react';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { HabitGlyph, UI } from '@/components/ui/icons';
import { Chip, Row } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { activeHabits } from '@/src/state/selectors';
import { useTracker } from '@/src/state/TrackerProvider';

export const WIDGET_MAX = 3;

/**
 * Which habits the home-screen widget shows, in order. Empty = automatic (water,
 * the snack that is up next in the movement rotation, and mind). The widget
 * itself exists only in the installed Android build (`src/widget/`).
 */
export function WidgetPickerCard() {
  const c = useColors();
  const { state, actions } = useTracker();
  const chosen = state.settings.widgetHabitIds;
  const habits = activeHabits(state);

  const toggle = (id: string) => {
    if (chosen.includes(id)) return actions.updateSettings({ widgetHabitIds: chosen.filter((x) => x !== id) });
    if (chosen.length >= WIDGET_MAX) return;
    actions.updateSettings({ widgetHabitIds: [...chosen, id] });
  };

  return (
    <Card>
      <View style={{ paddingVertical: 12, gap: 10 }}>
        <Row gap={10} style={{ alignItems: 'center' }}>
          <UI.Widget size={20} color={c.gold} />
          <View style={{ flex: 1 }}>
            <Txt role="title2">Home-screen widget</Txt>
            <Txt role="footnote" tone="secondary">
              Up to {WIDGET_MAX} habits, each with a one-tap log. Automatic picks water, movement and mind.
            </Txt>
          </View>
        </Row>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Chip label="Automatic" selected={chosen.length === 0} color={c.gold} onPress={() => actions.updateSettings({ widgetHabitIds: [] })} />
          {habits.map((h) => (
            <Chip
              key={h.id}
              label={h.name}
              selected={chosen.includes(h.id)}
              color={c.gold}
              Leading={(p) => <HabitGlyph icon={h.icon} {...p} />}
              onPress={() => toggle(h.id)}
            />
          ))}
        </Row>
        <Txt role="caption" tone="secondary">
          {chosen.length >= WIDGET_MAX ? `That is the limit of ${WIDGET_MAX}; deselect one to pick another. ` : ''}
          Tap a ring on the widget to log; tap its name to open the habit. A small widget shows the first
          habit only.
        </Txt>
        <Txt role="caption" tone="tertiary">
          To add it: long-press an empty spot on the home screen → Widgets → Daily Tracker, then drag it out
          (Samsung: pinch the home screen → Widgets). Expo Go and the web preview have no widget.
        </Txt>
      </View>
    </Card>
  );
}
