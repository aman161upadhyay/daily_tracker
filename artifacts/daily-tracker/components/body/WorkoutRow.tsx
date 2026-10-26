import React from 'react';
import { StyleSheet, View } from 'react-native';
import { UI } from '@/components/ui/icons';
import { IconButton, Row } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { exerciseLabel, isWalk } from '@/src/domain/body/exerciseTypes';
import { formatSleep, originName } from '@/src/domain/body/stats';
import { ticksStrength } from '@/src/state/bodyCommands';
import type { Workout } from '@/src/domain/body/types';
import { formatClock, formatDayLong } from '@/src/domain/time/format';
import { minutesOfDay } from '@/src/domain/time/trackingDay';

interface Props {
  workout: Workout;
  zone: string;
  today: string;
  onToggleHidden: () => void;
}

/** One imported exercise session with its hide / unhide control. */
export function WorkoutRow({ workout: w, zone, today, onToggleHidden }: Props) {
  const c = useColors();
  const label = exerciseLabel(w.type, w.title);
  const tags: string[] = [];
  if (ticksStrength(w.type, w.minutes)) tags.push('ticks Strength session');
  else if (isWalk(w.type)) tags.push('walk');
  const src = originName(w.origin);
  if (src) tags.push(src);
  return (
    <Row style={styles.row} gap={12}>
      <View style={{ flex: 1 }}>
        <Txt role="body" tone={w.hidden ? 'tertiary' : 'primary'}>
          {label}
          <Txt role="body" tone="secondary">{` · ${formatSleep(w.minutes)}`}</Txt>
        </Txt>
        <Txt role="footnote" tone="secondary">
          {`${w.day === today ? 'Today' : formatDayLong(w.day)} · ${formatClock(minutesOfDay(w.startAt, zone))}${tags.length > 0 ? ` · ${tags.join(' · ')}` : ''}`}
        </Txt>
      </View>
      <IconButton Glyph={w.hidden ? UI.Undo : UI.Archive} label={w.hidden ? `Show ${label} again` : `Hide ${label}`} onPress={onToggleHidden} size={36} color={c.textSecondary} />
    </Row>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    paddingVertical: 10,
  },
});
