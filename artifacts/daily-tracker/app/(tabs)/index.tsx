import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AmountSheet } from '@/components/tracker/AmountSheet';
import { HabitRow } from '@/components/tracker/HabitRow';
import { HighlightCard } from '@/components/tracker/HighlightCard';
import { NudgeCard } from '@/components/tracker/NudgeCard';
import { QuickLogSheet } from '@/components/tracker/QuickLogSheet';
import { SampleDataChip } from '@/components/tracker/SampleDataChip';
import { SummaryCard } from '@/components/tracker/SummaryCard';
import { TodayRings } from '@/components/tracker/TodayRings';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Dot, IconButton, PillButton, Row, SectionHeader } from '@/components/ui/primitives';
import { Avatar, Screen, ScreenHeader } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import type { Habit } from '@/src/domain/models';
import { formatClock, formatDayLong, formatNumber, formatVolume } from '@/src/domain/time/format';
import { minutesOfDay } from '@/src/domain/time/trackingDay';
import { presetById } from '@/src/library/presets';
import { useHabitViews, useHighlights, useLiveNudge, useTodaySummary } from '@/src/state/hooks';
import { cycleTimeline, mindSeries, rotationItems, snackSeries, snackSuggestion, waterSeries } from '@/src/state/selectors';
import { displayPhase, PHASE_LABELS, phaseQualifier } from '@/src/domain/cycle/timeline';
import { formatDayShort } from '@/src/domain/time/format';
import { dayDiff } from '@/src/domain/time/trackingDay';
import { useTracker } from '@/src/state/TrackerProvider';

export default function TodayScreen() {
  const c = useColors();
  const router = useRouter();
  const { state, today, nowMin, zone, actions } = useTracker();
  const summary = useTodaySummary();
  const nudge = useLiveNudge();
  const views = useHabitViews();
  const highlights = useHighlights();
  const [logOpen, setLogOpen] = useState(false);
  const [amountHabit, setAmountHabit] = useState<Habit | null>(null);
  /** Amount / custom-minute habits need a value; everything else logs one tap. */
  const needsAmount = (h: Habit) => h.type === 'AMOUNT' || (h.type === 'TIMER' && !h.mindKind);

  const s = state.settings;
  const units = s.units;
  const water = summary.water;
  const logged = formatVolume(water.loggedMl, units);
  const goal = formatVolume(water.goalMl, units);
  const remaining = formatVolume(water.remainingMl, units);

  const lastWater = state.water.filter((w) => w.day === today).sort((a, b) => b.at - a.at)[0];
  const shield = state.habits.find((h) => h.presetId === 'sugar-shield' && !h.archived);
  const lastSnack = state.snacks.filter((x) => x.day === today).sort((a, b) => b.at - a.at)[0];
  const lastMind = state.mind.filter((x) => x.day === today).sort((a, b) => b.endAt - a.endAt)[0];
  // A pinned card only for a habit the person actually has (or logged today): someone tracking
  // vitamins and steps is not shown "0 of 0 snacks" and an empty Mind card.
  const active = state.habits.filter((h) => !h.archived);
  const showWater = active.some((h) => h.presetId === 'water') || water.loggedMl > 0;
  // Sugar Shield is a snack habit, but a shield-only person has no movement target: the card would read "0 of 0 snacks".
  const showMovement = active.some((h) => h.snackType && h.presetId !== 'sugar-shield') || summary.snacksDone > 0;
  const showMind = active.some((h) => h.mindKind) || summary.mindMinutes > 0;

  const beforeNoon = nowMin < 12 * 60;
  const centerValue = beforeNoon ? remaining.value : String(summary.snacksDone);
  const centerLabel = beforeNoon ? `${remaining.unit} to go` : summary.snacksDone === 1 ? 'snack' : 'snacks';

  const waterDetail = water.reachedGoal
    ? 'Goal reached'
    : water.onPace
      ? `of ${goal.value} ${goal.unit} · on pace`
      : `of ${goal.value} ${goal.unit} · ${formatVolume(water.catchUpMl, units).value} ${units} would catch you up`;

  const openSettings = () => router.push('/settings');

  return (
    <Screen>
      <ScreenHeader
        title="Today"
        subtitle={formatDayLong(today)}
        right={
          <>
            <IconButton Glyph={UI.Plus} label="Log something" onPress={() => setLogOpen(true)} size={40} filled />
            <Avatar name={s.name} onPress={openSettings} />
          </>
        }
      />

      <SampleDataChip />

      <Card featured>
        <Row gap={16} style={{ alignItems: 'center' }}>
          <TodayRings values={summary.rings} size={164}>
            <Txt role="display" style={{ fontSize: 26, lineHeight: 30 }}>
              {centerValue}
            </Txt>
            <Txt role="caption" tone="secondary">
              {centerLabel}
            </Txt>
          </TodayRings>
          <View style={{ flex: 1, gap: 12 }}>
            <Legend color={c.cat.hydration} label="Hydration" value={`${logged.value} / ${goal.value} ${goal.unit}`} />
            <Legend color={c.cat.movement} label="Movement" value={`${summary.snacksDone} / ${summary.snacksTarget} snacks`} />
            <Legend color={c.cat.mind} label="Mind" value={`${formatNumber(summary.mindMinutes)} / ${formatNumber(summary.mindTarget)} min`} />
          </View>
        </Row>
      </Card>

      <NudgeCard
        nudge={nudge}
        hasRotation={rotationItems(state).length > 0}
        suggestion={nudge ? snackSuggestion(nudge.item.snackType) : undefined}
        activeStartMin={s.activeStartMin}
        activeEndMin={s.activeEndMin}
        nowMin={nowMin}
        onDone={() => nudge && actions.logSnack(nudge.item.snackType, { habitId: nudge.item.habitId, trigger: 'NUDGE' })}
        onSnooze={() => actions.snoozeNudge(10)}
        onSwap={() => actions.swapNudge()}
        onSettings={openSettings}
      />

      <SectionHeader title="Pinned" action="Show all" onAction={() => router.push('/habits')} />

      {!showWater && !showMovement && !showMind ? (
        <Card>
          <Txt role="body" tone="secondary">
            Water, movement snacks and Mind get a card here once you add them from the Library.
          </Txt>
        </Card>
      ) : null}

      {showWater ? (
        <SummaryCard
          title="Water"
          color={c.cat.hydration}
          icon="drop"
          value={logged.value}
          unit={logged.unit}
          detail={waterDetail}
          timestamp={lastWater ? formatClock(minutesOfDay(lastWater.at, zone)) : undefined}
          chart={{ values: waterSeries(state, today, 7), goal: s.waterGoalMl }}
          onPress={() => {
            // Water logged today without the Water habit (it was archived, or a drink came from the
            // widget): the card is still a door — to the Library, where the habit can be added back.
            const h = state.habits.find((x) => x.presetId === 'water' && !x.archived);
            if (h) router.push({ pathname: '/habit/[id]', params: { id: h.id } });
            // The instant makes the second knock distinct from the first: the Library opens again
            // after the sheet was dismissed and the door tapped once more.
            else router.push({ pathname: '/habits', params: { preset: 'water', t: String(Date.now()) } });
          }}
          footer={
            <Row gap={8}>
              <PillButton label={`+${formatVolume(s.tapSizeMl, units).value} ${units}`} Leading={UI.Drop} color={c.green} onPress={() => actions.addWater(s.tapSizeMl)} style={{ flex: 1 }} />
              <IconButton Glyph={UI.Undo} label="Undo last water entry" onPress={() => actions.undoWater()} size={48} color={c.text} />
            </Row>
          }
        />
      ) : null}

      {showMovement ? (
        <SummaryCard
          title="Movement snacks"
          color={c.cat.movement}
          icon="squat"
          value={String(summary.snacksDone)}
          unit={`of ${summary.snacksTarget}`}
          detail={lastSnack ? `Last: ${snackSuggestion(lastSnack.type)}` : 'None yet today'}
          timestamp={lastSnack ? formatClock(minutesOfDay(lastSnack.at, zone)) : undefined}
          chart={{ values: snackSeries(state, today, 7), goal: summary.snacksTarget }}
          onPress={() => router.push('/habits')}
          footer={<PillButton label={shield ? 'Sugar Shield — squats before something sweet' : 'Something sweet coming? Start the Sugar Shield'} Leading={UI.Cookie} color={c.gold} kind="ghost" onPress={() => router.push('/shield')} />}
        />
      ) : null}

      {showMind ? (
        <SummaryCard
          title="Mind"
          color={c.cat.mind}
          icon="lotus"
          value={formatNumber(summary.mindMinutes)}
          unit={`of ${formatNumber(summary.mindTarget)} min`}
          detail={lastMind ? (lastMind.kind === 'MEDITATION' ? 'Meditation' : 'Breathing') : 'Open the timer to start'}
          timestamp={lastMind ? formatClock(minutesOfDay(lastMind.endAt, zone)) : undefined}
          chart={{ values: mindSeries(state, today, 7), goal: summary.mindTarget, kind: 'line' }}
          onPress={() => router.push('/mind')}
        />
      ) : null}

      {s.cycleEnabled && s.cycle.showOnToday ? <CycleSummary /> : null}

      {highlights.length > 0 ? (
        <>
          <SectionHeader title="Highlights" />
          {highlights.map((h) => (
            <HighlightCard key={h.id} highlight={h} onPress={h.habitId ? () => router.push({ pathname: '/habit/[id]', params: { id: h.habitId! } }) : undefined} />
          ))}
        </>
      ) : null}

      <SectionHeader title="Habits" action="Library" onAction={() => router.push('/habits')} />
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        {views.map((v, i) => (
          <HabitRow
            key={v.habit.id}
            view={v}
            last={i === views.length - 1}
            units={units}
            nudgeText={presetById(v.habit.presetId)?.nudgeText.split(',')[0]}
            onPress={() => router.push({ pathname: '/habit/[id]', params: { id: v.habit.id } })}
            onIncrement={() => (needsAmount(v.habit) ? setAmountHabit(v.habit) : actions.increment(v.habit))}
            onDecrement={() => actions.decrement(v.habit)}
            onToggle={() => actions.toggleYesNo(v.habit)}
            onTimer={() => (needsAmount(v.habit) ? setAmountHabit(v.habit) : router.push({ pathname: '/mind', params: { kind: v.habit.mindKind ?? 'MEDITATION' } }))}
          />
        ))}
        {views.length === 0 ? (
          <View style={{ paddingVertical: 20 }}>
            <Txt role="body" tone="secondary" align="center">
              No habits yet. Add some from the Library.
            </Txt>
          </View>
        ) : null}
      </Card>

      <QuickLogSheet visible={logOpen} onClose={() => setLogOpen(false)} />
      {amountHabit ? <AmountSheet visible onClose={() => setAmountHabit(null)} habit={amountHabit} /> : null}
    </Screen>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <Row gap={8} style={styles.legend}>
      <Dot color={color} size={10} />
      <View style={{ flex: 1 }}>
        <Txt role="footnote" tone="secondary">
          {label}
        </Txt>
        <Txt role="callout" numberOfLines={1}>
          {value}
        </Txt>
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  legend: {
    alignItems: 'flex-start',
  },
});

/** The cycle at a glance: day and phase, when the next period is expected. Only with tracking on. */
function CycleSummary() {
  const c = useColors();
  const router = useRouter();
  const { state, calendarToday } = useTracker();
  const timeline = cycleTimeline(state, calendarToday);
  const prediction = timeline.prediction;
  const info = timeline.infoOn(calendarToday);
  const birthControl = state.settings.cycle.birthControl;
  const word = phaseQualifier(info, calendarToday, calendarToday);
  const until = prediction ? dayDiff(calendarToday, prediction.nextStart) : 0;
  const detail = !prediction
    ? 'Log your first period on the Cycle tab'
    : prediction.lateDays > 0
      ? `Period expected ${formatDayShort(prediction.nextStart)} · ${prediction.lateDays} ${prediction.lateDays === 1 ? 'day' : 'days'} late`
      : until === 0
        ? 'Period expected today'
        : `Next period around ${formatDayShort(prediction.nextStart)} · in ${until} ${until === 1 ? 'day' : 'days'}`;
  return (
    <SummaryCard
      title="Cycle"
      color={c.cat.cycle}
      Glyph={UI.Cycle}
      value={info ? `Day ${info.cycleDay}` : '—'}
      unit={info ? `${PHASE_LABELS[displayPhase(info.phase, birthControl)]}${word ? ` (${word})` : ''}` : undefined}
      detail={detail}
      onPress={() => router.push('/cycle')}
    />
  );
}
