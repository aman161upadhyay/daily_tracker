import React, { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { AppLockCard } from '@/components/settings/AppLockCard';
import { BackupCard } from '@/components/settings/BackupCard';
import { HealthConnectCard } from '@/components/settings/HealthConnectCard';
import { RemindersCard } from '@/components/settings/RemindersCard';
import { WidgetPickerCard } from '@/components/settings/WidgetPickerCard';
import { PinnedCardsSheet } from '@/components/tracker/PinnedCardsSheet';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Chip, Divider, PillButton, Row, SectionHeader, Segmented, Stepper } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { confirmDestructive } from '@/components/ui/confirm';
import { TYPE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import type { ThemePreference, Units, WeekStart } from '@/src/domain/models';
import { weekEndIndex } from '@/src/domain/time/trackingDay';
import { WATER_GOAL_MAX_ML, WATER_GOAL_MIN_ML } from '@/src/data/validate';
import { formatClock, formatVolume, parseClockInput, parseVolumeInput } from '@/src/domain/time/format';
import { PINNED_CARD_META } from '@/src/domain/today/pinned';
import { useTracker } from '@/src/state/TrackerProvider';

const INTERVALS = [45, 60, 90, 120];
const BOUNDARIES = [0, 2, 3, 4, 5];
const TAP_SIZES = [150, 250, 350, 500];

export default function SettingsScreen() {
  const c = useColors();
  const { state, actions } = useTracker();
  const s = state.settings;
  const [cardsOpen, setCardsOpen] = useState(false);

  const confirm = confirmDestructive;

  return (
    <Screen topInset={false}>
      <SectionHeader title="You" style={{ marginTop: 0 }} />
      <Card>
        <Setting label="Name" hint="Shown as the initial on Today">
          <TextInput
            value={s.name}
            onChangeText={(name) => actions.updateSettings({ name })}
            placeholder="Your name"
            placeholderTextColor={c.textTertiary}
            style={[TYPE.body, styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.hairline }]}
            accessibilityLabel="Name"
          />
        </Setting>
        <Divider />
        <Setting label="Units">
          <View style={{ width: 160 }}>
            <Segmented<Units> options={[{ value: 'ml', label: 'ml' }, { value: 'oz', label: 'oz' }]} value={s.units} onChange={(units) => actions.updateSettings({ units })} />
          </View>
        </Setting>
        <Divider />
        <Setting label="Appearance" hint="Dark is the designed look; System follows the phone">
          <Segmented<ThemePreference>
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
            value={s.theme}
            onChange={(theme) => actions.updateSettings({ theme })}
          />
        </Setting>
      </Card>

      <SectionHeader title="Privacy" />
      <AppLockCard />

      <SectionHeader title="Water" />
      <Card>
        <Setting label="Daily goal" hint="Adults need about 2–3 L of drinks a day">
          <Stepper
            value={s.waterGoalMl}
            onChange={(waterGoalMl) => actions.updateSettings({ waterGoalMl })}
            step={250}
            // The same range the Water habit's editor accepts, so neither side shows a number the other refuses.
            min={WATER_GOAL_MIN_ML}
            max={WATER_GOAL_MAX_ML}
            label="water goal"
            format={(v) => {
              const f = formatVolume(v, s.units);
              return `${f.value} ${f.unit}`;
            }}
            // Typed in the unit shown: "64" in ounces is 64 oz, not 64 ml.
            parse={(text) => parseVolumeInput(text, s.units)}
            inputKind="amount"
            keyboardType="decimal-pad"
            placeholder={s.units === 'oz' ? '64 oz' : '2,000 ml'}
          />
        </Setting>
        <Divider />
        <Setting label="One tap adds" hint="The amount the + button and the home-screen widget log">
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {TAP_SIZES.map((ml) => {
              const f = formatVolume(ml, s.units);
              return <Chip key={ml} label={`${f.value} ${f.unit}`} Leading={UI.Drop} color={c.cat.hydration} selected={s.tapSizeMl === ml} onPress={() => actions.updateSettings({ tapSizeMl: ml })} />;
            })}
          </Row>
        </Setting>
      </Card>

      <SectionHeader title="Reminders" />
      <RemindersCard />

      <SectionHeader title="Nudge cadence" />
      <Card>
        <Setting label="Active hours" hint="Automatic nudges only inside this window; fixed times you set yourself are kept">
          <View style={{ gap: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt role="body" tone="secondary">
                From
              </Txt>
              <Stepper value={s.activeStartMin} onChange={(v) => actions.updateSettings({ activeStartMin: Math.min(v, s.activeEndMin - 60) })} step={30} min={5 * 60} max={12 * 60} label="start of active hours" format={formatClock} parse={parseClockInput} />
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt role="body" tone="secondary">
                Until
              </Txt>
              <Stepper value={s.activeEndMin} onChange={(v) => actions.updateSettings({ activeEndMin: Math.max(v, s.activeStartMin + 60) })} step={30} min={14 * 60} max={23 * 60 + 30} label="end of active hours" format={formatClock} parse={parseClockInput} />
            </Row>
          </View>
        </Setting>
        <Divider />
        <Setting label="Movement interval" hint="One snack slot every…">
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {INTERVALS.map((m) => (
              <Chip key={m} label={`${m} min`} selected={s.nudgeIntervalMin === m} onPress={() => actions.updateSettings({ nudgeIntervalMin: m })} />
            ))}
          </Row>
        </Setting>
        <Divider />
        <Setting label="Daily cap" hint="Across all habits">
          <Stepper value={s.dailyNudgeCap} onChange={(dailyNudgeCap) => actions.updateSettings({ dailyNudgeCap })} min={2} max={24} label="daily nudge cap" />
        </Setting>
      </Card>

      <SectionHeader title="Today" />
      <Card>
        <Setting label="Cards on Today" hint={`Showing: ${s.pinned.filter((id) => id !== 'cycle' || (s.cycleEnabled && s.cycle.showOnToday)).map((id) => PINNED_CARD_META[id].title).join(', ') || 'none'}`}>
          <PillButton label="Choose cards and order" kind="ghost" Leading={UI.Pin} onPress={() => setCardsOpen(true)} style={{ alignSelf: 'flex-start' }} />
        </Setting>
      </Card>
      <PinnedCardsSheet visible={cardsOpen} onClose={() => setCardsOpen(false)} />

      <SectionHeader title="Widget" />
      <WidgetPickerCard />

      <SectionHeader title="Day & cycle" />
      <Card>
        <Setting label="Day starts at" hint="Water after midnight counts for the evening before">
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {BOUNDARIES.map((h) => (
              <Chip key={h} label={h === 0 ? 'Midnight' : `${h} am`} selected={s.dayBoundaryHour === h} onPress={() => actions.updateSettings({ dayBoundaryHour: h })} />
            ))}
          </Row>
        </Setting>
        <Divider />
        <Setting label="Week starts on" hint="Weekly targets, the week strips and the calendars count from this day">
          <Segmented<WeekStart>
            options={[
              { value: 'monday', label: 'Monday' },
              { value: 'sunday', label: 'Sunday' },
            ]}
            value={s.weekStart}
            onChange={(weekStart) =>
              // "Your week" is sent on the week's last evening, so it follows the choice (Sunday → Saturday).
              actions.updateSettings({ weekStart, weeklySummary: { ...s.weeklySummary, weekday: weekEndIndex(weekStart) } })
            }
          />
        </Setting>
        <Divider />
        <Row style={{ justifyContent: 'space-between', paddingVertical: 12 }}>
          <View style={{ flex: 1 }}>
            <Txt role="title2">Cycle tracking</Txt>
            <Txt role="footnote" tone="secondary">
              Adds the Cycle tab. Off by default; kept inside the app (and in the phone backup, if that is on).
            </Txt>
          </View>
          <Switch value={s.cycleEnabled} onValueChange={(cycleEnabled) => actions.updateSettings({ cycleEnabled })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Cycle tracking" />
        </Row>
        {s.cycleEnabled ? (
          <>
            <Divider />
            <Setting label="Typical cycle" hint="Used until three cycles are logged">
              <Stepper value={s.cycle.avgCycleDays} onChange={(avgCycleDays) => actions.updateSettings({ cycle: { ...s.cycle, avgCycleDays } })} min={20} max={45} label="typical cycle length" format={(v) => `${v} days`} />
            </Setting>
            <Setting label="Period length">
              <Stepper value={s.cycle.periodDays} onChange={(periodDays) => actions.updateSettings({ cycle: { ...s.cycle, periodDays } })} min={2} max={10} label="period length" format={(v) => `${v} days`} />
            </Setting>
            <Setting label="Luteal phase" hint="Ovulation to the next period; 14 is typical">
              <Stepper value={s.cycle.lutealDays} onChange={(lutealDays) => actions.updateCycle({ lutealDays })} min={10} max={16} label="luteal length" format={(v) => `${v} days`} />
            </Setting>
            <Divider />
            <Row style={{ justifyContent: 'space-between', paddingVertical: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt role="title2">Birth control</Txt>
                <Txt role="footnote" tone="secondary">
                  Hides the fertile window and ovulation; periods and phases stay.
                </Txt>
              </View>
              <Switch value={s.cycle.birthControl} onValueChange={(birthControl) => actions.updateCycle({ birthControl })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Birth control mode" />
            </Row>
            <Divider />
            <Row style={{ justifyContent: 'space-between', paddingVertical: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt role="title2">Discreet notifications</Txt>
                <Txt role="footnote" tone="secondary">
                  Cycle reminders say only “You have a reminder”. They are hidden on the lock screen either way.
                </Txt>
              </View>
              <Switch value={s.cycle.discreet} onValueChange={(discreet) => actions.updateCycle({ discreet })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Discreet cycle notifications" />
            </Row>
            <Divider />
            <Row style={{ justifyContent: 'space-between', paddingVertical: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt role="title2">Show on Today</Txt>
                <Txt role="footnote" tone="secondary">
                  A small Cycle card (day and phase) on the Today tab. Off keeps it to the Cycle tab.
                </Txt>
              </View>
              <Switch value={s.cycle.showOnToday} onValueChange={(showOnToday) => actions.updateCycle({ showOnToday })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Show cycle on Today" />
            </Row>
          </>
        ) : null}
        {s.cycle.history.length > 0 || state.cycleLogs.length > 0 ? (
          <>
            <Divider />
            <Row style={{ justifyContent: 'space-between', paddingVertical: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt role="title2">Cycle data</Txt>
                <Txt role="footnote" tone="secondary">
                  {`${s.cycle.history.length} ${s.cycle.history.length === 1 ? 'period' : 'periods'}, ${state.cycleLogs.length} day ${state.cycleLogs.length === 1 ? 'log' : 'logs'}. Turning tracking off keeps them.`}
                </Txt>
              </View>
              <PillButton
                label="Delete"
                kind="danger"
                compact
                onPress={() => confirm('Delete cycle data?', 'Every period and day log is removed from this phone. Reminders and settings stay.', 'Delete', () => actions.clearCycle())}
              />
            </Row>
          </>
        ) : null}
      </Card>

      <SectionHeader title="Connections" />
      <HealthConnectCard confirm={confirm} />

      <SectionHeader title="Your data" />
      <BackupCard confirm={confirm} />

      <SectionHeader title="About" />
      <Card>
        <Txt role="body">Daily Tracker {Constants.expoConfig?.version ?? ''}</Txt>
        <Txt role="footnote" tone="secondary" style={{ marginTop: 6 }}>
          No analytics, ads or crash reporting. The only time the app uses the network is when you tap an evidence link. Nothing in this app is medical advice.
        </Txt>
      </Card>
    </Screen>
  );
}

function Setting({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.setting}>
      <View style={{ marginBottom: 8 }}>
        <Txt role="title2">{label}</Txt>
        {hint ? (
          <Txt role="footnote" tone="secondary">
            {hint}
          </Txt>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  setting: {
    paddingVertical: 12,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
});
