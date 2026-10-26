import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EvidencePill } from '@/components/tracker/EvidenceBlock';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Dot, IconTile, PillButton, Row, Segmented, Stepper } from '@/components/ui/primitives';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Txt } from '@/components/ui/Txt';
import { TYPE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { describeImport, inspectExport } from '@/src/data/transfer';
import { withAlpha } from '@/src/domain/color/oklch';
import { DEFAULT_SETTINGS, type Units } from '@/src/domain/models';
import { formatClock, formatVolume, parseClockInput } from '@/src/domain/time/format';
import { CATEGORY_LABELS, CATEGORY_ORDER, PRESETS } from '@/src/library/presets';
import { deleteSnapshot, readSnapshot } from '@/src/services/backup';
import { afterSnapshots } from '@/src/services/snapshotSync';
import { NOTIFICATIONS_SUPPORTED, getPermission, requestPermission, type PermissionState } from '@/src/services/notifications';
import { useTracker } from '@/src/state/TrackerProvider';
import type { TrackerState } from '@/src/state/types';

const STARTER_SET = ['water', 'squat-snack', 'walk-break', 'meditate'];

/**
 * First-run setup: a single scroll so nothing is hidden behind "Next".
 * Everything here can be changed later in Settings or the Library.
 */
export default function OnboardingScreen() {
  const c = useColors();
  const router = useRouter();
  const { actions } = useTracker();
  const [name, setName] = useState('');
  const [units, setUnits] = useState<Units>('ml');
  const [waterGoalMl, setWaterGoalMl] = useState(DEFAULT_SETTINGS.waterGoalMl);
  const [activeStartMin, setStart] = useState(DEFAULT_SETTINGS.activeStartMin);
  const [activeEndMin, setEnd] = useState(DEFAULT_SETTINGS.activeEndMin);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(STARTER_SET));
  const [cycleEnabled, setCycleEnabled] = useState(false);
  const [cloudBackup, setCloudBackup] = useState(true);
  const [perm, setPerm] = useState<PermissionState>('undetermined');
  const [restore, setRestore] = useState<{ state: TrackerState; writtenAt: number | null } | null>(null);

  useEffect(() => {
    if (NOTIFICATIONS_SUPPORTED) getPermission().then(setPerm).catch(() => {});
  }, []);

  // A snapshot left by Android Auto Backup (or a previous install) means this is a returning user.
  useEffect(() => {
    let alive = true;
    readSnapshot()
      .then((snap) => {
        if (!snap || !alive) return;
        const inspected = inspectExport(snap.text);
        if (inspected.kind === 'plain' && inspected.state.habits.length > 0) setRestore({ state: inspected.state, writtenAt: snap.writtenAt });
      })
      .catch((err) => console.warn('[backup] snapshot unreadable', err));
    return () => {
      alive = false;
    };
  }, []);

  const restoreSnapshot = () => {
    if (!restore) return;
    actions.importState(restore.state);
    router.replace('/');
  };

  // "Start fresh" is a decision about that data: the old snapshot goes, so it cannot be offered
  // again (or restored onto yet another phone) once this person said no to it.
  const startFresh = () => {
    setRestore(null);
    afterSnapshots(deleteSnapshot).catch((err) => console.warn('[backup] could not remove the old snapshot', err));
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const start = () => {
    actions.completeOnboarding({ name, units, waterGoalMl, activeStartMin, activeEndMin, presetIds: PRESETS.filter((p) => selected.has(p.id)).map((p) => p.id), cycleEnabled, cloudBackup });
    router.replace('/');
  };

  const sample = () => {
    actions.loadSample();
    router.replace('/');
  };

  const goal = formatVolume(waterGoalMl, units);
  const groups = CATEGORY_ORDER.map((k) => ({ key: k, items: PRESETS.filter((p) => p.category === k) })).filter((g) => g.items.length > 0);

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={[styles.mark, { backgroundColor: withAlpha(c.green, 0.16), borderColor: withAlpha(c.gold, 0.5) }]}>
          <UI.Sparkle size={28} color={c.greenBright} weight="fill" />
        </View>
        <Txt role="display" style={{ marginTop: 16 }}>
          Daily Tracker
        </Txt>
        <Txt role="body" tone="secondary" style={{ marginTop: 6 }}>
          Small habits, honest numbers. Your data lives on this phone — no account, no server.
        </Txt>
      </View>

      {restore ? (
        <Card featured style={{ marginBottom: 20 }}>
          <Row gap={12}>
            <IconTile Glyph={UI.Archive} color={c.gold} size={40} />
            <View style={{ flex: 1 }}>
              <Txt role="title2">Welcome back</Txt>
              <Txt role="footnote" tone="secondary" style={{ marginTop: 2 }}>
                {`Android restored a backup${restore.writtenAt ? ` from ${new Date(restore.writtenAt).toLocaleDateString()}` : ''} with ${describeImport(restore.state)}.`}
              </Txt>
            </View>
          </Row>
          <Row gap={8} style={{ marginTop: 14, flexWrap: 'wrap' }}>
            <PillButton label="Restore it" Leading={UI.Check} onPress={restoreSnapshot} />
            <PillButton label="Start fresh" kind="ghost" onPress={startFresh} />
          </Row>
        </Card>
      ) : null}

      <Step n={1} title="About you">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name (optional)"
          placeholderTextColor={c.textTertiary}
          style={[TYPE.body, styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.hairline }]}
          accessibilityLabel="Your name"
          returnKeyType="done"
        />
        <Row style={{ justifyContent: 'space-between', marginTop: 14 }}>
          <Txt role="body" tone="secondary">
            Volumes in
          </Txt>
          <View style={{ width: 160 }}>
            <Segmented<Units> options={[{ value: 'ml', label: 'ml' }, { value: 'oz', label: 'oz' }]} value={units} onChange={setUnits} />
          </View>
        </Row>
      </Step>

      <Step n={2} title="Water and your day">
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt role="body">Daily water goal</Txt>
            <Txt role="footnote" tone="secondary">
              Adults need about 2–3 L of drinks a day
            </Txt>
          </View>
          <Stepper value={waterGoalMl} onChange={setWaterGoalMl} step={250} min={1000} max={4000} label="water goal" format={() => `${goal.value} ${goal.unit}`} />
        </Row>
        <View style={{ marginTop: 16, gap: 10 }}>
          <Txt role="body">Nudges only between</Txt>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt role="body" tone="secondary">
              From
            </Txt>
            <Stepper value={activeStartMin} onChange={(v) => setStart(Math.min(v, activeEndMin - 60))} step={30} min={5 * 60} max={12 * 60} label="start of active hours" format={formatClock} parse={parseClockInput} />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt role="body" tone="secondary">
              Until
            </Txt>
            <Stepper value={activeEndMin} onChange={(v) => setEnd(Math.max(v, activeStartMin + 60))} step={30} min={14 * 60} max={23 * 60 + 30} label="end of active hours" format={formatClock} parse={parseClockInput} />
          </Row>
        </View>
      </Step>

      <Step n={3} title="Pick your first habits" hint="A few is plenty. Each one comes with its evidence; add more from the Library any time.">
        {groups.map((g) => (
          <View key={g.key} style={{ marginTop: 10 }}>
            <Row gap={8} style={{ marginBottom: 4 }}>
              <Dot color={c.cat[g.key]} />
              <Txt role="callout" color={c.cat[g.key]}>
                {CATEGORY_LABELS[g.key]}
              </Txt>
            </Row>
            {g.items.map((p) => {
              const on = selected.has(p.id);
              return (
                <PressableScale
                  key={p.id}
                  haptic={false}
                  scaleTo={0.985}
                  onPress={() => toggle(p.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${p.name}, ${p.ruleText}`}
                  style={styles.presetRow}
                >
                  <IconTile icon={p.icon} color={c.cat[p.category]} size={40} />
                  <View style={{ flex: 1 }}>
                    <Row gap={8}>
                      <Txt role="title2" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {p.name}
                      </Txt>
                      <EvidencePill grade={p.evidence} />
                    </Row>
                    <Txt role="footnote" tone="secondary" numberOfLines={1}>
                      {p.ruleText}
                    </Txt>
                  </View>
                  <View style={[styles.check, on ? { backgroundColor: c.green, borderColor: c.green } : { borderColor: c.textTertiary }]}>{on ? <UI.Check size={16} color={c.onGreen} weight="bold" /> : null}</View>
                </PressableScale>
              );
            })}
          </View>
        ))}
      </Step>

      <Step
        n={4}
        title="Cycle tracking"
        hint={`Optional. Adds a Cycle tab with period logging and gentle predictions. Stored only on this phone${Platform.OS === 'android' ? ' (and in your phone backup, if you turn that on below)' : ''}.`}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt role="body">Track my cycle</Txt>
          <Switch value={cycleEnabled} onValueChange={setCycleEnabled} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Track my cycle" />
        </Row>
      </Step>

      {Platform.OS === 'android' ? (
        <Step
          n={5}
          title="Phone backup"
          hint="If your phone's own backup is on, Android keeps a copy of your logs with your Google account so a new phone can restore them. It travels only encrypted with your screen lock (Android 9 or newer) and never goes to us — there is no server. Off means the data lives on this phone alone unless you export a file."
        >
          <Row style={{ justifyContent: 'space-between' }} gap={12}>
            <Txt role="body" style={{ flex: 1 }}>
              Include in Android phone backup
            </Txt>
            <Switch value={cloudBackup} onValueChange={setCloudBackup} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Include in Android phone backup" />
          </Row>
        </Step>
      ) : null}

      {NOTIFICATIONS_SUPPORTED ? (
        <Step n={Platform.OS === 'android' ? 6 : 5} title="Reminders" hint="Nudges arrive as notifications with Done, Snooze and Swap buttons, only inside your active hours and never more than a few a day. Optional — the app works without them.">
          {perm === 'granted' ? (
            <Row gap={8}>
              <UI.Check size={18} color={c.greenBright} weight="bold" />
              <Txt role="body">Notifications allowed. Tune them any time in Settings → Reminders.</Txt>
            </Row>
          ) : perm === 'denied' ? (
            <Txt role="body" tone="secondary">
              Notifications are off for this app. You can allow them later in Settings → Reminders, which opens the phone's notification settings.
            </Txt>
          ) : (
            <PillButton
              label="Allow notifications"
              Leading={UI.Bell}
              kind="ghost"
              onPress={() => {
                requestPermission()
                  .then(setPerm)
                  .catch(() => {});
              }}
            />
          )}
        </Step>
      ) : null}

      <View style={{ gap: 10, marginTop: 8, marginBottom: 24 }}>
        <PillButton label={selected.size > 0 ? `Start with ${selected.size} habit${selected.size === 1 ? '' : 's'}` : 'Start empty'} Leading={UI.Check} onPress={start} />
        <PillButton label="Explore with sample data instead" kind="ghost" onPress={sample} />
      </View>
    </Screen>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <Card>
      <Row gap={10} style={{ marginBottom: 12 }}>
        <View style={[styles.stepNo, { backgroundColor: withAlpha(c.green, 0.16) }]}>
          <Txt role="caption" color={c.greenBright}>
            {n}
          </Txt>
        </View>
        <Txt role="title1">{title}</Txt>
      </Row>
      {hint ? (
        <Txt role="footnote" tone="secondary" style={{ marginBottom: 6 }}>
          {hint}
        </Txt>
      ) : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingTop: 12,
    paddingBottom: 20,
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    minHeight: 56,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
