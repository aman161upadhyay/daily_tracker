import React, { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
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
import { withAlpha } from '@/src/domain/color/oklch';
import { DEFAULT_SETTINGS, type Units } from '@/src/domain/models';
import { formatClock, formatVolume } from '@/src/domain/time/format';
import { CATEGORY_LABELS, CATEGORY_ORDER, PRESETS } from '@/src/library/presets';
import { useTracker } from '@/src/state/TrackerProvider';

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

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const start = () => {
    actions.completeOnboarding({ name, units, waterGoalMl, activeStartMin, activeEndMin, presetIds: PRESETS.filter((p) => selected.has(p.id)).map((p) => p.id), cycleEnabled });
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
          Small habits, honest numbers. Everything stays on this phone.
        </Txt>
      </View>

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
            <Stepper value={activeStartMin} onChange={(v) => setStart(Math.min(v, activeEndMin - 60))} step={30} min={5 * 60} max={12 * 60} label="start of active hours" format={formatClock} />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt role="body" tone="secondary">
              Until
            </Txt>
            <Stepper value={activeEndMin} onChange={(v) => setEnd(Math.max(v, activeStartMin + 60))} step={30} min={14 * 60} max={23 * 60 + 30} label="end of active hours" format={formatClock} />
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

      <Step n={4} title="Cycle tracking" hint="Optional. Adds a Cycle tab with period logging and gentle predictions. Nothing leaves the phone.">
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt role="body">Track my cycle</Txt>
          <Switch value={cycleEnabled} onValueChange={setCycleEnabled} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Track my cycle" />
        </Row>
      </Step>

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
