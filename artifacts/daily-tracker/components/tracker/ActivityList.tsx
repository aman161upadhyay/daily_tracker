import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { confirmDestructive } from '@/components/ui/confirm';
import { showToast } from '@/components/ui/Toast';
import { HabitGlyph, UI } from '@/components/ui/icons';
import { Divider, IconButton, PillButton, Row } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { habitActivity, type ActivityRecord } from '@/src/domain/habits/activity';
import type { Habit } from '@/src/domain/models';
import { formatClock, formatDayShort } from '@/src/domain/time/format';
import { lastNDays, minutesOfDay } from '@/src/domain/time/trackingDay';
import { useTracker } from '@/src/state/TrackerProvider';
import { useClockFormat } from '@/src/state/hooks';

export interface ActivityListProps {
  habit: Habit;
}

/**
 * The records behind the habit's figures, newest first, each with its own Remove: a drink the
 * widget logged twice, squats counted twice from a reminder, come off exactly, not by rewriting
 * the day's total. Today by default; the last seven days on request. Records another app owns
 * (Health Connect) are listed but not removable: the next read would bring them back.
 */
export function ActivityList({ habit }: ActivityListProps) {
  const c = useColors();
  const { state, today, zone, actions } = useTracker();
  const clock = useClockFormat();
  const [week, setWeek] = useState(false);
  const units = state.settings.units;
  const days = useMemo(() => (week ? lastNDays(today, 7) : [today]), [week, today]);
  const records = useMemo(() => habitActivity(state, habit, days, units), [state, habit, days, units]);
  const imported = records.some((r) => !r.removable);

  const whenOf = (r: ActivityRecord) => (r.day === today ? `at ${formatClock(minutesOfDay(r.at, zone), clock)}` : `on ${formatDayShort(r.day)}`);
  const remove = (r: ActivityRecord) => {
    const when = whenOf(r);
    confirmDestructive('Remove this entry?', `${r.amount} ${when} comes off that day's total.`, 'Remove', () => {
      // The exact record comes back on Undo — same id, time and origin — not a new one logged now.
      const gone = actions.removeLog(r.log, r.id);
      if (gone) showToast({ message: `Removed ${r.amount} ${when}`, actionLabel: 'Undo', onAction: () => actions.restoreLogs([gone]) });
    });
  };

  // Grouped by day, newest day first (the records already come newest first).
  const groups: { day: string; rows: ActivityRecord[] }[] = [];
  for (const r of records) {
    const g = groups[groups.length - 1];
    if (g && g.day === r.day) g.rows.push(r);
    else groups.push({ day: r.day, rows: [r] });
  }
  // The time in a Remove button's name, and when three taps landed in the same minute, which of
  // the three: four "Remove 250 ml entry" buttons read alike to a screen reader.
  const baseName = (r: ActivityRecord) => `Remove ${r.amount} entry ${whenOf(r)}`;
  const alike = new Map<string, number>();
  for (const r of records) if (r.removable) alike.set(baseName(r), (alike.get(baseName(r)) ?? 0) + 1);
  const seen = new Map<string, number>();
  const removeName = (r: ActivityRecord) => {
    const name = baseName(r);
    const total = alike.get(name) ?? 1;
    if (total === 1) return name;
    const nth = (seen.get(name) ?? 0) + 1;
    seen.set(name, nth);
    return `${name}, ${nth} of ${total}`;
  };

  return (
    <View>
      {records.length === 0 ? (
        <Txt role="body" tone="secondary">
          {week ? 'Nothing logged in the last 7 days.' : 'Nothing logged yet today.'}
        </Txt>
      ) : (
        groups.map((g, gi) => (
          <View key={g.day}>
            {week ? (
              <Txt role="caption" tone="tertiary" style={{ marginTop: gi === 0 ? 0 : 10, marginBottom: 2 }}>
                {g.day === today ? 'Today' : formatDayShort(g.day)}
              </Txt>
            ) : null}
            {g.rows.map((r, i) => (
              <View key={`${r.log}:${r.id}`}>
                <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                  <Row gap={10} style={{ flex: 1 }}>
                    <HabitGlyph icon={habit.icon} size={18} color={c.cat[habit.category]} weight="fill" />
                    <Txt role="body">{r.amount}</Txt>
                    <Txt role="footnote" tone="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {formatClock(minutesOfDay(r.at, zone), clock)}
                      {r.via ? ` · ${r.via}` : ''}
                    </Txt>
                  </Row>
                  {r.removable ? <IconButton Glyph={UI.Trash} label={removeName(r)} onPress={() => remove(r)} size={36} color={c.textSecondary} /> : <View style={{ width: 36, height: 36 }} />}
                </Row>
                {i < g.rows.length - 1 ? <Divider /> : null}
              </View>
            ))}
          </View>
        ))
      )}
      {imported ? (
        <Txt role="caption" tone="tertiary" style={{ marginTop: 8 }}>
          Entries from Health Connect follow the app that recorded them; remove them there.
        </Txt>
      ) : null}
      <PillButton label={week ? 'Show today only' : 'Show the last 7 days'} kind="ghost" compact onPress={() => setWeek((w) => !w)} style={{ alignSelf: 'flex-start', marginTop: 10 }} />
    </View>
  );
}
