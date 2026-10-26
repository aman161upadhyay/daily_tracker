import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SleepSummaryCard, StepsSummaryCard, sleepCardView, stepsCardView, stepsCardViewFromHabit } from '@/components/body/BodySummaryCards';
import { METRIC_META, metricColor } from '@/components/body/metrics';
import { AmountSheet } from '@/components/tracker/AmountSheet';
import { HabitRow } from '@/components/tracker/HabitRow';
import { HighlightCard } from '@/components/tracker/HighlightCard';
import { NudgeCard } from '@/components/tracker/NudgeCard';
import { PinnedCardsSheet } from '@/components/tracker/PinnedCardsSheet';
import { QuickLogSheet } from '@/components/tracker/QuickLogSheet';
import { SampleDataChip } from '@/components/tracker/SampleDataChip';
import { SummaryCard } from '@/components/tracker/SummaryCard';
import { TodayRings } from '@/components/tracker/TodayRings';
import { PressableScale } from '@/components/ui/PressableScale';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Dot, IconButton, IconTile, PillButton, Row, SectionHeader } from '@/components/ui/primitives';
import { Avatar, Screen, ScreenHeader } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import type { Habit } from '@/src/domain/models';
import { formatClock, formatDayLong, formatNumber, formatVolume } from '@/src/domain/time/format';
import { minutesOfDay } from '@/src/domain/time/trackingDay';
import { shortPolicyText } from '@/src/domain/nudges/describePolicy';
import { useClockFormat, useHabitViews, useHighlights, useLiveNudge, useTodaySummary } from '@/src/state/hooks';
import { type PinnedCardId } from '@/src/domain/today/pinned';
import { cycleTimeline, habitDayValue, mindSeries, policyFor, rotationItems, ruleFor, snackSeries, snackSuggestion, waterSeries } from '@/src/state/selectors';
import { displayPhase, PHASE_LABELS, phaseQualifier } from '@/src/domain/cycle/timeline';
import { formatDayShort } from '@/src/domain/time/format';
import { dayDiff } from '@/src/domain/time/trackingDay';
import { useTracker } from '@/src/state/TrackerProvider';

export default function TodayScreen() {
  const c = useColors();
  const router = useRouter();
  const { state, today, calendarToday, nowMin, zone, actions } = useTracker();
  const clock = useClockFormat();
  const summary = useTodaySummary();
  const nudge = useLiveNudge();
  const views = useHabitViews();
  const highlights = useHighlights();
  const [logOpen, setLogOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amountHabit, setAmountHabit] = useState<Habit | null>(null);
  /** Amount / custom-minute habits need a value; everything else logs one tap. */
  const needsAmount = (h: Habit) => h.type === 'AMOUNT' || (h.type === 'TIMER' && !h.mindKind);

  const s = state.settings;
  const units = s.units;
  const water = summary.water;
  const logged = formatVolume(water.loggedMl, units);
  const goal = formatVolume(water.goalMl, units);
  const remaining = formatVolume(water.remainingMl, units);

  // Newest record of the day per log, found once per change of that log (not on every render:
  // a sheet opening or the clock tick would otherwise rescan two years of drinks).
  const lastWater = useMemo(() => newestOn(state.water, today, (w) => w.at), [state.water, today]);
  const shield = state.habits.find((h) => h.presetId === 'sugar-shield' && !h.archived);
  const lastSnack = useMemo(() => newestOn(state.snacks, today, (x) => x.at), [state.snacks, today]);
  const lastMind = useMemo(() => newestOn(state.mind, today, (x) => x.endAt), [state.mind, today]);
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

  // Each card only when it has something to show; the order is the person's (Settings → Today → Cards).
  const stepsHabit = active.find((h) => h.presetId === 'steps');
  const wantSteps = s.pinned.includes('steps');
  const wantSleep = s.pinned.includes('sleep');
  // Health Connect's steps when it has any (calendar days, as the Body tab shows them); otherwise
  // the Steps habit's own log (tracking days) — the picker promises either source.
  const stepsView = useMemo(() => {
    if (!wantSteps) return null;
    const fromBody = stepsCardView(state.body, calendarToday);
    if (fromBody.present || !stepsHabit) return fromBody;
    return stepsCardViewFromHabit((d) => habitDayValue(state, stepsHabit, d), today);
  }, [wantSteps, state, stepsHabit, calendarToday, today]);
  const sleepView = useMemo(() => (wantSleep ? sleepCardView(state.body, calendarToday, zone) : null), [wantSleep, state.body, calendarToday, zone]);
  const stepsGoal = stepsHabit ? ruleFor(state, stepsHabit.id, today)?.target : undefined;
  const available: Record<PinnedCardId, boolean> = {
    water: showWater,
    snacks: showMovement,
    mind: showMind,
    cycle: s.cycleEnabled && s.cycle.showOnToday,
    steps: wantSteps,
    sleep: wantSleep,
  };
  const shown = s.pinned.filter((id) => available[id]);
  // Built on demand: a card that is not shown costs nothing (its chart selector is not run).
  const cards: Record<PinnedCardId, () => React.ReactNode> = {
    water: () => (
      <SummaryCard
        title="Water"
        color={c.cat.hydration}
        icon="drop"
        value={logged.value}
        unit={logged.unit}
        detail={waterDetail}
        timestamp={lastWater ? formatClock(minutesOfDay(lastWater.at, zone), clock) : undefined}
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
    ),
    snacks: () => (
      <SummaryCard
        title="Movement snacks"
        color={c.cat.movement}
        icon="squat"
        value={String(summary.snacksDone)}
        unit={summary.snacksTarget > 0 ? `of ${summary.snacksTarget}` : 'today'}
        detail={lastSnack ? `Last: ${snackSuggestion(lastSnack.type)}` : 'None yet today'}
        timestamp={lastSnack ? formatClock(minutesOfDay(lastSnack.at, zone), clock) : undefined}
        chart={{ values: snackSeries(state, today, 7), goal: summary.snacksTarget }}
        onPress={() => router.push('/habits')}
        footer={<PillButton label={shield ? 'Sugar Shield — squats before something sweet' : 'Something sweet coming? Start the Sugar Shield'} Leading={UI.Cookie} color={c.gold} kind="ghost" onPress={() => router.push('/shield')} />}
      />
    ),
    mind: () => (
      <SummaryCard
        title="Mind"
        color={c.cat.mind}
        icon="lotus"
        value={formatNumber(summary.mindMinutes)}
        unit={summary.mindTarget > 0 ? `of ${formatNumber(summary.mindTarget)} min` : 'min today'}
        detail={lastMind ? (lastMind.kind === 'MEDITATION' ? 'Meditation' : 'Breathing') : 'Open the timer to start'}
        timestamp={lastMind ? formatClock(minutesOfDay(lastMind.endAt, zone), clock) : undefined}
        chart={{ values: mindSeries(state, today, 7), goal: summary.mindTarget, kind: 'line' }}
        onPress={() => router.push('/mind')}
      />
    ),
    cycle: () => <CycleSummary />,
    steps: () =>
      stepsView && stepsView.present ? (
        <StepsSummaryCard view={stepsView} goal={stepsGoal} hasHabit={!!stepsHabit} onPress={() => router.push({ pathname: '/body/[metric]', params: { metric: 'steps' } })} onAddHabit={() => router.push('/habits')} />
      ) : (
        <PinnedEmptyCard id="steps" onPress={() => router.push('/body')} />
      ),
    sleep: () =>
      sleepView && sleepView.present && sleepView.night ? (
        <SleepSummaryCard view={{ ...sleepView, night: sleepView.night }} zone={zone} onPress={() => router.push({ pathname: '/body/[metric]', params: { metric: 'sleep' } })} />
      ) : (
        <PinnedEmptyCard id="sleep" onPress={() => router.push('/body')} />
      ),
  };

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
            {/* With nothing asked today (no movement or mind habit, or every quota met), the count stands alone: "6 / 0" reads as broken. */}
            <Legend color={c.cat.movement} label="Movement" value={summary.snacksTarget > 0 ? `${summary.snacksDone} / ${summary.snacksTarget} snacks` : `${summary.snacksDone} snacks`} />
            <Legend color={c.cat.mind} label="Mind" value={summary.mindTarget > 0 ? `${formatNumber(summary.mindMinutes)} / ${formatNumber(summary.mindTarget)} min` : `${formatNumber(summary.mindMinutes)} min`} />
          </View>
        </Row>
      </Card>

      <NudgeCard
        nudge={nudge}
        hasRotation={rotationItems(state).length > 0}
        suggestion={nudge ? snackSuggestion(nudge.item.snackType) : undefined}
        activeStartMin={s.activeStartMin}
        nowMin={nowMin}
        onDone={() => nudge && actions.logSnack(nudge.item.snackType, { habitId: nudge.item.habitId, trigger: 'NUDGE' })}
        onSnooze={() => actions.snoozeNudge(10)}
        onSwap={() => actions.swapNudge()}
        onSettings={openSettings}
      />

      <SectionHeader title="Pinned" action="Choose cards" onAction={() => setPickerOpen(true)} />

      {shown.length === 0 ? (
        <Card>
          <Txt role="body" tone="secondary">
            {s.pinned.length <= 1 ? 'No cards chosen. Tap "Choose cards" to pin water, movement, Mind, steps or sleep here.' : 'Water, movement snacks and Mind get a card here once you add them from the Library.'}
          </Txt>
        </Card>
      ) : null}

      {shown.map((id) => (
        <React.Fragment key={id}>{cards[id]()}</React.Fragment>
      ))}

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
            nudgeText={shortPolicyText(policyFor(state, v.habit.id), { movement: !!v.habit.snackType, water: v.habit.presetId === 'water', rotationIntervalMin: state.settings.nudgeIntervalMin, clock })}
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
      <PinnedCardsSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} />
      {amountHabit ? <AmountSheet visible onClose={() => setAmountHabit(null)} habit={amountHabit} /> : null}
    </Screen>
  );
}

/** A pinned Steps or Sleep card with nothing behind it yet: says where the data comes from, opens Body. */
function PinnedEmptyCard({ id, onPress }: { id: 'steps' | 'sleep'; onPress: () => void }) {
  const c = useColors();
  const meta = METRIC_META[id];
  return (
    <Card>
      <PressableScale haptic={false} scaleTo={0.99} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${meta.title}: nothing from Health Connect yet`} accessibilityHint="Opens the Body tab">
        <Row gap={12}>
          <IconTile icon={meta.icon} color={metricColor(c, id)} size={40} />
          <View style={{ flex: 1 }}>
            <Txt role="title2">{meta.title}</Txt>
            <Txt role="footnote" tone="secondary">
              Nothing from Health Connect yet · {meta.blurb.toLowerCase()} · connect on the Body tab
            </Txt>
          </View>
          <UI.Caret size={16} color={c.textTertiary} weight="bold" />
        </Row>
      </PressableScale>
    </Card>
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

/** The newest record of `day` in a log (by the instant `at` gives), or undefined. */
function newestOn<T extends { day: string }>(log: readonly T[], day: string, at: (x: T) => number): T | undefined {
  let best: T | undefined;
  for (const x of log) if (x.day === day && (best === undefined || at(x) > at(best))) best = x;
  return best;
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
