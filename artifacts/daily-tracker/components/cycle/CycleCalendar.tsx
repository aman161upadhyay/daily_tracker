import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { UI } from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/PressableScale';
import { Dot, IconButton, Row } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { withAlpha } from '@/src/domain/color/oklch';
import { displayPhase, PHASE_LABELS, type CyclePhase, type CycleTimeline } from '@/src/domain/cycle/timeline';
import { addDays, parseDay, toDayString, weekdayOf } from '@/src/domain/time/trackingDay';
import { phaseColor, phaseFill } from './phaseColors';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface CycleCalendarProps {
  /** "YYYY-MM" */
  month: string;
  today: string;
  timeline: CycleTimeline;
  birthControl: boolean;
  /** Days that carry a log (flow, mood, symptoms or a note). */
  loggedDays: ReadonlySet<string>;
  selected?: string;
  onSelect: (day: string) => void;
  onMonthChange: (month: string) => void;
}

function monthOf(day: string): string {
  return day.slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + by;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Month grid, Monday first; days are tinted by phase (solid = logged, soft = predicted). */
export function CycleCalendar({ month, today, timeline, birthControl, loggedDays, selected, onSelect, onMonthChange }: CycleCalendarProps) {
  const c = useColors();
  const palette = { cycle: c.cat.cycle, green: c.green, violet: c.violetSoft, gold: c.goldBright, textTertiary: c.textTertiary };

  const cells = useMemo(() => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    const first = toDayString(y, m, 1);
    const lead = weekdayOf(first);
    const n = daysInMonth(month);
    const out: (string | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 0; d < n; d++) out.push(addDays(first, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [month]);

  const legend = useMemo(() => {
    const seen = new Set<CyclePhase>();
    for (const day of cells) {
      if (!day) continue;
      const info = timeline.infoOn(day);
      if (info) seen.add(displayPhase(info.phase, birthControl));
    }
    seen.delete('follicular');
    return (['menstrual', 'fertile', 'luteal', 'late-luteal'] as CyclePhase[]).filter((p) => seen.has(p));
  }, [cells, timeline, birthControl]);

  const [year, monthIndex] = month.split('-').map(Number) as [number, number];
  const thisMonth = monthOf(today);

  return (
    <View>
      <Row style={styles.header}>
        <IconButton Glyph={UI.Back} label="Previous month" onPress={() => onMonthChange(shiftMonth(month, -1))} size={36} color={c.text} />
        <PressableScale haptic={false} onPress={() => onMonthChange(thisMonth)} accessibilityRole="button" accessibilityLabel="Jump to this month" style={{ flex: 1 }}>
          <Txt role="title2" align="center">{`${MONTHS[monthIndex - 1]} ${year}`}</Txt>
        </PressableScale>
        <IconButton Glyph={UI.Caret} label="Next month" onPress={() => onMonthChange(shiftMonth(month, 1))} size={36} color={c.text} />
      </Row>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Txt key={`${w}-${i}`} role="caption" tone="tertiary" align="center" style={styles.weekday}>
            {w}
          </Txt>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`empty-${i}`} style={styles.cell} />;
          const info = timeline.infoOn(day);
          const phase = info ? displayPhase(info.phase, birthControl) : undefined;
          const fill = info && phase ? phaseFill(phase, info.predicted, palette) : undefined;
          const isToday = day === today;
          const isSelected = day === selected;
          const future = day > today;
          const { day: num } = parseDay(day);
          const a11y = [`${day}`, phase ? PHASE_LABELS[phase] : '', info?.predicted ? 'predicted' : info?.estimated ? 'estimated' : '', loggedDays.has(day) ? 'has a log' : ''].filter(Boolean).join(', ');
          return (
            <PressableScale key={day} haptic={false} onPress={() => onSelect(day)} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected: isSelected }} style={styles.cell}>
              <View
                style={[
                  styles.disc,
                  fill ? { backgroundColor: fill } : null,
                  isSelected ? { borderColor: c.text, borderWidth: 2 } : isToday ? { borderColor: c.green, borderWidth: 2 } : null,
                ]}
              >
                <Txt role="callout" color={future && !fill ? c.textTertiary : c.text} align="center">
                  {String(num)}
                </Txt>
                {info?.isOvulation && !birthControl ? <View style={[styles.ovulation, { borderColor: c.green }]} /> : null}
              </View>
              <View style={styles.marker}>{loggedDays.has(day) ? <Dot color={c.textSecondary} size={4} /> : null}</View>
            </PressableScale>
          );
        })}
      </View>
      {legend.length > 0 ? (
        <Row gap={14} style={styles.legend}>
          {legend.map((p) => (
            <Row key={p} gap={6}>
              <Dot color={phaseColor(p, palette)} />
              <Txt role="caption" tone="secondary">
                {PHASE_LABELS[p]}
              </Txt>
            </Row>
          ))}
          <Row gap={6}>
            <View style={[styles.legendSoft, { backgroundColor: withAlpha(c.text, 0.18) }]} />
            <Txt role="caption" tone="secondary">
              Predicted
            </Txt>
          </Row>
        </Row>
      ) : null}
    </View>
  );
}

const CELL = 40;

const styles = StyleSheet.create({
  header: {
    marginBottom: 6,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
    marginHorizontal: -12,
  },
  weekday: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Bleeds into the card's padding: on a 360 dp phone the seven columns come to ~46 dp each
    // instead of ~42, close to the 48 dp touch target without shrinking the discs.
    marginHorizontal: -12,
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48, // the touch target; the coloured disc inside stays 36 dp
    paddingVertical: 2,
  },
  disc: {
    width: CELL - 4,
    height: CELL - 4,
    borderRadius: (CELL - 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ovulation: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderRadius: CELL / 2,
    borderWidth: 1.5,
  },
  marker: {
    height: 6,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    marginTop: 10,
    flexWrap: 'wrap',
    rowGap: 6,
  },
  legendSoft: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
