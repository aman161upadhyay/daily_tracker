import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Chip, Divider, PillButton, Row, SectionHeader, Segmented, Stepper } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { TYPE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { describeImport, exportState, pickImport } from '@/src/data/transfer';
import type { Units } from '@/src/domain/models';
import { formatClock, formatVolume } from '@/src/domain/time/format';
import { useTracker } from '@/src/state/TrackerProvider';

const INTERVALS = [45, 60, 90, 120];
const BOUNDARIES = [0, 2, 3, 4, 5];
const TAP_SIZES = [150, 250, 350, 500];

export default function SettingsScreen() {
  const c = useColors();
  const { state, actions, storageError } = useTracker();
  const s = state.settings;
  const [transfer, setTransfer] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = (title: string, message: string, label: string, run: () => void) => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && !window.confirm(`${title}\n\n${message}`)) return;
      return run();
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: 'destructive', onPress: run },
    ]);
  };

  const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

  const doExport = async () => {
    setBusy(true);
    setTransfer(null);
    try {
      await exportState(state);
      setTransfer({ tone: 'ok', text: 'Backup created. Keep it somewhere safe; it contains everything you logged.' });
    } catch (err) {
      setTransfer({ tone: 'error', text: `Export failed: ${message(err)}` });
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    setTransfer(null);
    try {
      const incoming = await pickImport();
      if (!incoming) return;
      confirm('Replace everything with this backup?', `It holds ${describeImport(incoming)}. Your current data on this phone is replaced.`, 'Import', () => {
        actions.importState(incoming);
        setTransfer({ tone: 'ok', text: `Imported ${describeImport(incoming)}.` });
      });
    } catch (err) {
      setTransfer({ tone: 'error', text: `Import failed: ${message(err)}` });
    } finally {
      setBusy(false);
    }
  };

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
      </Card>

      <SectionHeader title="Water" />
      <Card>
        <Setting label="Daily goal" hint="Adults need about 2–3 L of drinks a day">
          <Stepper
            value={s.waterGoalMl}
            onChange={(waterGoalMl) => actions.updateSettings({ waterGoalMl })}
            step={250}
            min={1000}
            max={4000}
            label="water goal"
            format={(v) => {
              const f = formatVolume(v, s.units);
              return `${f.value} ${f.unit}`;
            }}
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

      <SectionHeader title="Nudges" />
      <Card>
        <Setting label="Active hours" hint="Nudges only inside this window">
          <View style={{ gap: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt role="body" tone="secondary">
                From
              </Txt>
              <Stepper value={s.activeStartMin} onChange={(v) => actions.updateSettings({ activeStartMin: Math.min(v, s.activeEndMin - 60) })} step={30} min={5 * 60} max={12 * 60} label="start of active hours" format={formatClock} />
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt role="body" tone="secondary">
                Until
              </Txt>
              <Stepper value={s.activeEndMin} onChange={(v) => actions.updateSettings({ activeEndMin: Math.max(v, s.activeStartMin + 60) })} step={30} min={14 * 60} max={23 * 60 + 30} label="end of active hours" format={formatClock} />
            </Row>
          </View>
        </Setting>
        <Divider />
        <Setting label="Movement interval" hint="One snack slot every…">
          <Row gap={8}>
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

      <SectionHeader title="Day & cycle" />
      <Card>
        <Setting label="Day starts at" hint="Water after midnight counts for the evening before">
          <Row gap={8}>
            {BOUNDARIES.map((h) => (
              <Chip key={h} label={h === 0 ? 'Midnight' : `${h} am`} selected={s.dayBoundaryHour === h} onPress={() => actions.updateSettings({ dayBoundaryHour: h })} />
            ))}
          </Row>
        </Setting>
        <Divider />
        <Row style={{ justifyContent: 'space-between', paddingVertical: 12 }}>
          <View style={{ flex: 1 }}>
            <Txt role="title2">Cycle tracking</Txt>
            <Txt role="footnote" tone="secondary">
              Adds the Cycle tab. Off by default; nothing leaves the phone.
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
          </>
        ) : null}
      </Card>

      <SectionHeader title="Your data" />
      <Card>
        <Txt role="body">{s.sampleData ? 'You are looking at sample data.' : 'Everything is stored on this phone only. Export a backup before switching phones or reinstalling.'}</Txt>
        {storageError ? (
          <Txt role="footnote" color={c.danger} style={{ marginTop: 8 }}>
            Saving is failing: {storageError}
          </Txt>
        ) : null}
        <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <PillButton label="Export backup" Leading={UI.Download} kind="ghost" onPress={doExport} disabled={busy} />
          <PillButton label="Import backup" Leading={UI.Upload} kind="ghost" onPress={doImport} disabled={busy} />
        </Row>
        {transfer ? (
          <Txt role="footnote" color={transfer.tone === 'error' ? c.danger : c.greenBright} style={{ marginTop: 10 }}>
            {transfer.text}
          </Txt>
        ) : null}
        <Divider />
        <Row gap={8} style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {s.sampleData ? (
            <PillButton label="Start fresh" kind="ghost" onPress={() => confirm('Start fresh?', 'Removes the sample history and keeps your settings.', 'Start fresh', actions.startFresh)} />
          ) : (
            <>
              <PillButton label="Load sample data" kind="ghost" onPress={() => confirm('Replace your data?', 'This replaces everything you logged with sample history.', 'Replace', actions.loadSample)} />
              <PillButton label="Erase everything" kind="danger" Leading={UI.Trash} onPress={() => confirm('Erase everything?', 'All habits and logs on this phone are deleted. Settings are kept.', 'Erase', actions.startFresh)} />
            </>
          )}
        </Row>
      </Card>

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
