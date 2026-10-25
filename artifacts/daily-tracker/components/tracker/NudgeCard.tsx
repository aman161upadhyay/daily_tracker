import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { formatClock, formatIn } from '@/src/domain/time/format';
import type { NextNudge } from '@/src/domain/nudges/nextNudge';
import { Card } from '../ui/Card';
import { UI } from '../ui/icons';
import { IconButton, IconTile, PillButton, Row } from '../ui/primitives';
import { Txt } from '../ui/Txt';

export interface NudgeCardProps {
  nudge: NextNudge | null;
  suggestion?: string;
  /** Whether any movement snack is enabled for nudging. */
  hasRotation: boolean;
  activeStartMin: number;
  activeEndMin: number;
  nowMin: number;
  onDone: () => void;
  onSnooze: () => void;
  onSwap: () => void;
  onSettings: () => void;
}

/** "Next: 10 squats · in 24 min" with Done now / Snooze / Swap. Gold frame while live. */
export function NudgeCard({ nudge, suggestion, hasRotation, activeStartMin, activeEndMin, nowMin, onDone, onSnooze, onSwap, onSettings }: NudgeCardProps) {
  const c = useColors();

  if (!nudge) {
    const text = !hasRotation
      ? 'Add a movement snack from the Library to get nudges.'
      : nowMin < activeStartMin
        ? `Movement nudges start at ${formatClock(activeStartMin)}.`
        : `Movement nudges are done for today. They resume at ${formatClock(activeStartMin)}.`;
    return (
      <Card>
        <Row gap={12}>
          <IconTile Glyph={UI.Bell} color={c.textTertiary} size={40} />
          <View style={{ flex: 1 }}>
            <Txt role="title2">{hasRotation ? 'Nudges paused' : 'No nudges yet'}</Txt>
            <Txt role="footnote" tone="secondary">
              {text}
            </Txt>
          </View>
          <IconButton Glyph={UI.Gear} label="Nudge settings" onPress={onSettings} size={40} color={c.textSecondary} haptic={false} />
        </Row>
      </Card>
    );
  }

  const live = nudge.inMin === 0;
  return (
    <Card featured={live}>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <IconTile Glyph={UI.Timer} color={c.cat.movement} size={40} />
        <View style={{ flex: 1 }}>
          <Txt role="footnote" tone={live ? 'gold' : 'secondary'}>
            {live ? 'Due now' : `Next · ${formatIn(nudge.inMin)} at ${formatClock(nudge.dueMin)}`}
          </Txt>
          <Txt role="title2" style={{ marginTop: 2 }}>
            {suggestion ?? nudge.item.label}
          </Txt>
        </View>
        <IconButton Glyph={UI.Gear} label="Nudge settings" onPress={onSettings} size={40} color={c.textSecondary} haptic={false} />
      </Row>
      <View style={styles.actions}>
        <PillButton label="Done now" onPress={onDone} compact Leading={UI.Check} style={{ flex: 1 }} />
        <PillButton label="Snooze 10" onPress={onSnooze} compact kind="ghost" />
        <IconButton Glyph={UI.Shuffle} label="Swap for another snack" onPress={onSwap} size={40} color={c.text} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
});
