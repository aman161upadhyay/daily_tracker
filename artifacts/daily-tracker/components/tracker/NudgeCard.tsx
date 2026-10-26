import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { formatClock, formatIn } from '@/src/domain/time/format';
import type { NextNudge } from '@/src/domain/nudges/nextNudge';
import { Card } from '../ui/Card';
import { UI } from '../ui/icons';
import { IconButton, IconTile, PillButton, Row } from '../ui/primitives';
import { Txt } from '../ui/Txt';
import { useClockFormat } from '@/src/state/hooks';

export interface NudgeCardProps {
  nudge: NextNudge | null;
  suggestion?: string;
  /** Whether any movement snack is enabled for nudging (the card is only shown when movement habits exist). */
  hasRotation: boolean;
  activeStartMin: number;
  activeEndMin: number;
  /** "until 3:30 PM" while the global pause runs (`pausedUntilText`); the card then says so instead of guessing. */
  pausedUntil?: string;
  nowMin: number;
  onDone: () => void;
  onSnooze: () => void;
  onSwap: () => void;
  onSettings: () => void;
}

/** "Next: 10 squats · in 24 min" with Done now / Snooze / Swap. Gold frame while live. */
export function NudgeCard({ nudge, suggestion, hasRotation, activeStartMin, activeEndMin, nowMin, pausedUntil, onDone, onSnooze, onSwap, onSettings }: NudgeCardProps) {
  const c = useColors();
  const clock = useClockFormat();

  if (!nudge) {
    // Says why nothing is planned, and promises no clock time the planner did not set: the first
    // slot of a day follows the active start by the interval, so "resume at 9:00 AM" was never true.
    const text = !hasRotation
      ? "Every movement reminder is off or paused. Turn one on from the habit's Reminders."
      : pausedUntil
        ? `Nudges are paused ${pausedUntil}. Resume them in Settings → Reminders.`
        : nowMin < activeStartMin
          ? `Movement nudges start after ${formatClock(activeStartMin, clock)}, your active hours' start.`
          : nowMin >= activeEndMin
            ? `Movement nudges are done for today; your active hours ended at ${formatClock(activeEndMin, clock)}.`
            : 'Movement nudges are done for today: every snack is logged or the day\'s reminders are used up.';
    return (
      <Card>
        <Row gap={12}>
          <IconTile Glyph={UI.Bell} color={c.textTertiary} size={40} />
          <View style={{ flex: 1 }}>
            <Txt role="title2">{!hasRotation ? 'No movement nudges' : pausedUntil ? 'Nudges paused' : 'No nudge due'}</Txt>
            <Txt role="footnote" tone="secondary">
              {text}
            </Txt>
          </View>
          <IconButton Glyph={UI.Gear} label="Reminder settings" onPress={onSettings} size={40} color={c.textSecondary} haptic={false} />
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
            {live ? 'Due now' : `Next · ${formatIn(nudge.inMin)} at ${formatClock(nudge.dueMin, clock)}`}
          </Txt>
          <Txt role="title2" style={{ marginTop: 2 }}>
            {suggestion ?? nudge.item.label}
          </Txt>
        </View>
        <IconButton Glyph={UI.Gear} label="Reminder settings" onPress={onSettings} size={40} color={c.textSecondary} haptic={false} />
      </Row>
      {/* The primary keeps a readable width; on a narrow phone the other two wrap under it instead of squeezing "Done now" to "D…". */}
      <View style={styles.actions}>
        <PillButton label="Done now" onPress={onDone} compact Leading={UI.Check} style={styles.primary} />
        <PillButton label="Snooze 10 min" onPress={onSnooze} compact kind="ghost" />
        <IconButton Glyph={UI.Shuffle} label="Swap for another snack" onPress={onSwap} size={40} color={c.text} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  primary: { flexGrow: 1, flexBasis: 150 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
});
