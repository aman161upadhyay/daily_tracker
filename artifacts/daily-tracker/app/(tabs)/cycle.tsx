import React, { useMemo, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CycleCalendar } from '@/components/cycle/CycleCalendar';
import { DaySheet } from '@/components/cycle/DaySheet';
import { InsightsCard } from '@/components/cycle/InsightsCard';
import { PhaseRing } from '@/components/cycle/PhaseRing';
import { ReminderSheet } from '@/components/cycle/ReminderSheet';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/PressableScale';
import { Divider, Dot, IconTile, PillButton, Row, SectionHeader } from '@/components/ui/primitives';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { confirmDestructive } from '@/components/ui/confirm';
import { SampleDataChip } from '@/components/tracker/SampleDataChip';
import { useColors } from '@/hooks/useColors';
import { withAlpha } from '@/src/domain/color/oklch';
import { cycleAlerts, NOT_CONTRACEPTION, outlierSuggestions } from '@/src/domain/cycle/alerts';
import { describeReminder, isOvulationBased } from '@/src/domain/cycle/reminders';
import { cycleLengths, todayOffer } from '@/src/domain/cycle/timeline';
import type { CycleReminder, PeriodSpan } from '@/src/domain/models';
import { formatClock, formatDayLong, formatDayShort } from '@/src/domain/time/format';
import { newId } from '@/src/domain/time/clock';
import { dayDiff } from '@/src/domain/time/trackingDay';
import { cycleInsights, cycleReminderFires, cycleTimeline } from '@/src/state/selectors';
import { useTracker } from '@/src/state/TrackerProvider';
import { useClockFormat } from '@/src/state/hooks';

/**
 * Opt-in cycle tab: phase ring and prediction, the month calendar with a day
 * sheet (flow, mood, symptoms, notes), upcoming windows and reminders,
 * irregularity notes, insights, reminder rules and the period history.
 */
export default function CycleScreen() {
  const c = useColors();
  const router = useRouter();
  const { state, calendarToday, actions } = useTracker();
  const clock = useClockFormat();
  const cycle = state.settings.cycle;
  const color = c.cat.cycle;

  const timeline = cycleTimeline(state, calendarToday);
  const prediction = timeline.prediction;
  const offer = todayOffer(cycle.history, cycle, calendarToday);
  const fires = cycleReminderFires(state, calendarToday);
  const insights = cycleInsights(state);
  const alerts = useMemo(() => cycleAlerts(cycle.history, calendarToday), [cycle.history, calendarToday]);
  const outliers = useMemo(() => outlierSuggestions(cycle.history), [cycle.history]);
  const loggedDays = useMemo(() => new Set(state.cycleLogs.map((l) => l.day)), [state.cycleLogs]);
  const logByDay = useMemo(() => new Map(state.cycleLogs.map((l) => [l.day, l])), [state.cycleLogs]);

  const [month, setMonth] = useState(calendarToday.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const [reminder, setReminder] = useState<CycleReminder | null>(null);
  const [editing, setEditing] = useState<PeriodSpan | null>(null);

  const history = useMemo(() => {
    const lengths = new Map(cycleLengths(cycle.history).map((l) => [l.start, l]));
    return [...timeline.history].reverse().map((p) => ({ ...p, cycle: lengths.get(p.start) }));
  }, [cycle.history, timeline.history]);

  const confirm = confirmDestructive;

  const saveReminder = (rule: CycleReminder) => {
    if (rule.id === '') actions.setCycleReminders([...cycle.reminders, { ...rule, id: `cr_${newId()}` }]);
    else actions.setCycleReminders(cycle.reminders.map((r) => (r.id === rule.id ? rule : r)));
  };

  const until = prediction ? dayDiff(calendarToday, prediction.nextStart) : 0;
  const predictionLine = prediction
    ? prediction.lateDays > 0
      ? `Period expected ${formatDayShort(prediction.nextStart)} · ${prediction.lateDays} ${prediction.lateDays === 1 ? 'day' : 'days'} late`
      : until === 0
        ? 'Period expected today'
        : `Next period ${formatDayShort(prediction.nextStart)} · in ${until} ${until === 1 ? 'day' : 'days'} · ±${prediction.rangeDays}`
    : null;

  // Reachable with tracking off only through a link or a stale history entry: offer the switch
  // instead of a tab the person turned off.
  if (!state.settings.cycleEnabled) {
    return (
      <Screen>
        <ScreenHeader title="Cycle" subtitle={formatDayLong(calendarToday)} />
        <Card>
          <Txt role="title2">Cycle tracking is off</Txt>
          <Txt role="body" tone="secondary" style={{ marginTop: 6 }}>
            {cycle.history.length > 0 || state.cycleLogs.length > 0 ? 'Your periods and day logs are kept. Turn tracking on to see them again.' : 'Turn it on to log periods, see your phase and set cycle reminders. Off by default; nothing is shared.'}
          </Txt>
          <Row gap={8} style={{ marginTop: 14, flexWrap: 'wrap' }}>
            <PillButton label="Turn on" color={color} onPress={() => actions.updateSettings({ cycleEnabled: true })} />
            <PillButton label="Back to Today" kind="ghost" onPress={() => router.replace('/')} />
          </Row>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Cycle" subtitle={formatDayLong(calendarToday)} />
      <SampleDataChip />

      {prediction ? (
        <Card featured={offer.kind === 'end' && offer.prominent}>
          <PhaseRing timeline={timeline} today={calendarToday} birthControl={cycle.birthControl} />
          <View style={[styles.prediction, { backgroundColor: withAlpha(color, 0.12) }]}>
            <Dot color={color} />
            <Txt role="callout" style={{ flex: 1 }}>
              {predictionLine}
            </Txt>
          </View>
          {prediction.lowConfidence ? (
            <Txt role="footnote" tone="tertiary" style={{ marginTop: 8 }}>
              {prediction.clamped && !cycle.birthControl ? 'A short cycle: ovulation is placed right after the period, so this is a rough guide.' : `Based on ${prediction.usableCycles} ${prediction.usableCycles === 1 ? 'cycle' : 'cycles'} and your typical length; it sharpens after three.`}
            </Txt>
          ) : null}
          <Row gap={8} style={{ marginTop: 14 }}>
            {offer.kind === 'end' ? (
              <PillButton label="Period ended today" kind={offer.prominent ? 'primary' : 'ghost'} color={color} compact onPress={() => actions.periodEnd()} style={{ flex: 1 }} />
            ) : offer.kind === 'ended-today' ? (
              <PillButton label="Undo “ended today”" kind="ghost" compact onPress={() => actions.updatePeriod(offer.start, { end: null })} style={{ flex: 1 }} />
            ) : (
              <PillButton label="Period started today" color={color} compact onPress={() => actions.periodStart()} style={{ flex: 1 }} />
            )}
            <PillButton label={loggedDays.has(calendarToday) ? 'Edit today' : 'Log today'} kind="ghost" compact Leading={UI.Edit} onPress={() => setDay(calendarToday)} />
          </Row>
        </Card>
      ) : (
        <Card featured>
          <Row gap={12}>
            <IconTile Glyph={UI.Cycle} color={color} size={44} />
            <View style={{ flex: 1 }}>
              <Txt role="title2">No periods logged yet</Txt>
              <Txt role="footnote" tone="secondary">
                Log the first day of your last few periods on the calendar below; predictions start with the first and sharpen after three.
              </Txt>
            </View>
          </Row>
          <PillButton label="Period started today" color={color} onPress={() => actions.periodStart()} style={{ marginTop: 14 }} />
        </Card>
      )}

      <Card>
        <CycleCalendar
          month={month}
          today={calendarToday}
          timeline={timeline}
          birthControl={cycle.birthControl}
          loggedDays={loggedDays}
          selected={day ?? undefined}
          onSelect={setDay}
          onMonthChange={setMonth}
        />
        <Txt role="caption" tone="tertiary" style={{ marginTop: 10 }}>
          Tap a day to log flow, mood and symptoms, or to mark a period start or end.
        </Txt>
      </Card>

      {prediction ? (
        <>
          <SectionHeader title="Upcoming" />
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            <UpcomingRow
              color={color}
              title="Next period"
              value={prediction.lateDays > 0 ? 'Any day now' : formatDayShort(prediction.nextStart)}
              detail={prediction.lateDays > 0 ? `${prediction.lateDays} ${prediction.lateDays === 1 ? 'day' : 'days'} past the expected start` : `${formatDayShort(prediction.earliest)} – ${formatDayShort(prediction.latest)}`}
            />
            {!cycle.birthControl && prediction.lateDays === 0 ? (
              <>
                <Divider />
                <UpcomingRow
                  color={c.green}
                  title="Fertile window"
                  value={prediction.fertileEnd < calendarToday ? 'Passed' : `${formatDayShort(prediction.fertileStart)} – ${formatDayShort(prediction.fertileEnd)}`}
                  detail={`Ovulation around ${formatDayShort(prediction.ovulation)}${prediction.clamped ? ' (short cycle)' : ''}`}
                />
              </>
            ) : null}
            {fires.map((f) => (
              <View key={f.reminder.id}>
                <Divider />
                <UpcomingRow color={c.gold} title={f.reminder.label} value={formatDayShort(f.day)} detail={`${formatClock(f.minute, clock)} · ${describeReminder(f.reminder)}${f.confirmed ? '' : ' · once the period is logged'}`} />
              </View>
            ))}
            {cycle.birthControl && cycle.reminders.some((r) => r.enabled && isOvulationBased(r)) ? (
              <>
                <Divider />
                <Txt role="footnote" tone="tertiary" style={{ paddingVertical: 12 }}>
                  Reminders tied to the fertile window or the luteal phase pause while birth control is on.
                </Txt>
              </>
            ) : null}
            {prediction.lateDays > 0 && cycle.reminders.some((r) => r.enabled) ? (
              <>
                <Divider />
                <Txt role="footnote" tone="tertiary" style={{ paddingVertical: 12 }}>
                  Cycle reminders pause while the period is late and resume once it is logged.
                </Txt>
              </>
            ) : null}
          </Card>
        </>
      ) : null}

      {alerts.length > 0 || outliers.length > 0 ? (
        <>
          <SectionHeader title="Worth knowing" />
          {alerts.map((a) => (
            <Card key={a.kind}>
              <Txt role="title2">{a.title}</Txt>
              <Txt role="footnote" tone="secondary" style={{ marginTop: 4 }}>
                {a.body}
              </Txt>
            </Card>
          ))}
          {outliers.map((o) => (
            <Card key={o.start}>
              <Txt role="title2">{`A ${o.length}-day cycle stands out`}</Txt>
              <Txt role="footnote" tone="secondary" style={{ marginTop: 4 }}>
                {`The cycle that started ${formatDayShort(o.start)} is well away from your median of ${Math.round(o.median)} days. If it was a one-off, leave it out of the predictions.`}
              </Txt>
              <PillButton label="Exclude from predictions" kind="ghost" compact onPress={() => actions.updatePeriod(o.start, { excluded: true })} style={{ alignSelf: 'flex-start', marginTop: 10 }} />
            </Card>
          ))}
        </>
      ) : null}

      <SectionHeader title="Insights" />
      <InsightsCard insights={insights} />

      <SectionHeader title="Reminders" action="Add" onAction={() => setReminder({ id: '', label: '', anchor: 'BEFORE_PERIOD', offsetDays: 3, minute: 9 * 60, enabled: true })} />
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        {cycle.reminders.length === 0 ? (
          <Txt role="footnote" tone="tertiary" style={{ paddingVertical: 14 }}>
            No cycle reminders. Add one to be told a few days before the period or at the start of a phase.
          </Txt>
        ) : (
          cycle.reminders.map((r, i) => (
            <View key={r.id}>
              {i > 0 ? <Divider /> : null}
              <Row style={styles.row}>
                <PressableScale haptic={false} onPress={() => setReminder(r)} accessibilityRole="button" accessibilityLabel={`Edit ${r.label}`} style={{ flex: 1 }}>
                  <Txt role="title2">{r.label}</Txt>
                  <Txt role="footnote" tone="secondary">
                    {`${describeReminder(r)} · ${formatClock(r.minute, clock)}`}
                  </Txt>
                </PressableScale>
                <Switch
                  value={r.enabled}
                  onValueChange={(enabled) => actions.setCycleReminders(cycle.reminders.map((x) => (x.id === r.id ? { ...x, enabled } : x)))}
                  trackColor={{ false: c.hairline, true: c.green }}
                  thumbColor={c.text}
                  accessibilityLabel={`${r.label} enabled`}
                />
              </Row>
            </View>
          ))
        )}
        <Divider />
        <Txt role="caption" tone="tertiary" style={{ paddingVertical: 12 }}>
          {cycle.discreet ? 'Discreet mode is on: notifications say only “You have a reminder”.' : 'Cycle notifications are hidden on the lock screen. Turn on discreet wording in Settings to hide the text everywhere.'}
        </Txt>
      </Card>

      {history.length > 0 ? (
        <>
          <SectionHeader title="History" />
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {history.map((p, i) => (
              <View key={p.start}>
                <PressableScale haptic={false} onPress={() => setEditing(p)} accessibilityRole="button" accessibilityLabel={`Edit period from ${p.start}`}>
                  <Row style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Txt role="title2" tone={p.excluded ? 'secondary' : 'primary'}>
                        {p.end ? `${formatDayShort(p.start)} – ${formatDayShort(p.end)}` : `${formatDayShort(p.start)} – ongoing`}
                      </Txt>
                      <Txt role="footnote" tone="secondary">
                        {[p.end ? `${dayDiff(p.start, p.end) + 1} days of period` : 'Period in progress', p.excluded ? 'excluded from predictions' : null].filter(Boolean).join(' · ')}
                      </Txt>
                    </View>
                    {p.cycle ? (
                      <Txt role="callout" tone={p.cycle.usable ? 'secondary' : 'tertiary'}>
                        {`${p.cycle.length}-day cycle`}
                      </Txt>
                    ) : null}
                    <UI.Caret size={18} color={c.textTertiary} weight="bold" />
                  </Row>
                </PressableScale>
                {i < history.length - 1 ? <Divider /> : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Card>
        <Txt role="footnote" tone="tertiary">
          {`${NOT_CONTRACEPTION} Everything here is kept inside the app on this phone; if Android phone backup is on (Settings → Backup), it is part of that encrypted backup too.`}
        </Txt>
      </Card>

      <PillButton label="Cycle settings" kind="ghost" Leading={UI.Gear} onPress={() => router.push('/settings')} style={{ alignSelf: 'flex-start' }} />

      <DaySheet
        day={day}
        today={calendarToday}
        timeline={timeline}
        birthControl={cycle.birthControl}
        log={day ? logByDay.get(day) : undefined}
        onClose={() => setDay(null)}
        onSave={(log) => actions.setCycleLog(log)}
        onPeriodStart={(d) => actions.periodStart(d)}
        onPeriodEnd={(d, start) => actions.updatePeriod(start, { end: d })}
        onRemovePeriod={(start) => actions.deletePeriod(start)}
      />

      <ReminderSheet reminder={reminder} birthControl={cycle.birthControl} onClose={() => setReminder(null)} onSave={saveReminder} onDelete={(id) => actions.setCycleReminders(cycle.reminders.filter((r) => r.id !== id))} />

      <Sheet visible={!!editing} title={editing ? `Period from ${formatDayShort(editing.start)}` : ''} onClose={() => setEditing(null)}>
        {editing ? (
          <>
            <Row style={styles.row}>
              <View style={{ flex: 1 }}>
                <Txt role="body">Exclude from predictions</Txt>
                <Txt role="footnote" tone="secondary">
                  Keeps the period, leaves the cycle it starts out of the averages.
                </Txt>
              </View>
              <Switch
                value={!!editing.excluded}
                onValueChange={(excluded) => {
                  actions.updatePeriod(editing.start, { excluded });
                  setEditing({ ...editing, excluded });
                }}
                trackColor={{ false: c.hairline, true: c.green }}
                thumbColor={c.text}
                accessibilityLabel="Exclude from predictions"
              />
            </Row>
            <Divider />
            <Txt role="footnote" tone="tertiary" style={{ paddingVertical: 12 }}>
              To move the start or end, tap the day on the calendar and use “Period started here” or “Period ended here”.
            </Txt>
            <PillButton
              label="Delete this period"
              kind="danger"
              onPress={() =>
                confirm('Delete this period?', 'The start and end dates are removed. Day logs stay.', 'Delete', () => {
                  actions.deletePeriod(editing.start);
                  setEditing(null);
                })
              }
            />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function UpcomingRow({ color, title, value, detail }: { color: string; title: string; value: string; detail: string }) {
  return (
    <Row style={styles.row}>
      <Dot color={color} size={10} />
      <View style={{ flex: 1 }}>
        <Txt role="title2">{title}</Txt>
        <Txt role="footnote" tone="secondary">
          {detail}
        </Txt>
      </View>
      <Txt role="callout" tone="secondary">
        {value}
      </Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  prediction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
  },
  row: {
    minHeight: 60,
    paddingVertical: 10,
  },
});
