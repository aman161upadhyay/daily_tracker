import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { TYPE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { WATER_GOAL_MAX_ML, WATER_GOAL_MIN_ML } from '@/src/data/validate';
import { defaultFreezes } from '@/src/domain/habits/streaks';
import type { Cadence, Category, Habit, HabitIcon, HabitRule, HabitType } from '@/src/domain/models';
import { formatNumber, formatVolume, parseVolumeInput } from '@/src/domain/time/format';
import { CATEGORY_LABELS } from '@/src/library/presets';
import { type HabitDraft, useTracker } from '@/src/state/TrackerProvider';
import { UI } from '../ui/icons';
import { Chip, Divider, IconTile, PillButton, Row, Segmented, Stepper } from '../ui/primitives';
import { PressableScale } from '../ui/PressableScale';
import { Sheet } from '../ui/Sheet';
import { Txt } from '../ui/Txt';

const TYPE_OPTIONS: { value: HabitType; label: string; hint: string }[] = [
  { value: 'YES_NO', label: 'Yes / no', hint: 'Did it or not' },
  { value: 'COUNT', label: 'Count', hint: 'Times, reps, pages' },
  { value: 'AMOUNT', label: 'Amount', hint: 'ml, g, km…' },
  { value: 'TIMER', label: 'Minutes', hint: 'Time spent' },
];

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
];

const CATEGORIES: Category[] = ['hydration', 'movement', 'fuel', 'mind', 'craft', 'body'];
const ICON_OPTIONS: HabitIcon[] = ['check', 'leaf', 'heart', 'journal', 'book', 'pen', 'code', 'barbell', 'drop', 'moon', 'lightning', 'walk', 'stretch', 'meal', 'lotus'];

const DEFAULT_UNIT: Record<HabitType, string> = { YES_NO: '', COUNT: 'times', AMOUNT: 'ml', TIMER: 'min' };

function draftFrom(habit: Habit | undefined, rule: HabitRule | undefined): HabitDraft {
  if (habit && rule) {
    return {
      name: habit.name,
      category: habit.category,
      type: habit.type,
      unit: habit.unit,
      icon: habit.icon,
      cadence: rule.cadence,
      timesPerPeriod: rule.timesPerPeriod,
      target: rule.target,
      freezesPerMonth: rule.freezesPerMonth,
      pinned: habit.pinned,
    };
  }
  return { name: '', category: 'mind', type: 'YES_NO', unit: '', icon: 'check', cadence: 'DAILY', timesPerPeriod: 3, target: 1, freezesPerMonth: defaultFreezes('DAILY'), pinned: false };
}

export interface HabitEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Omit to create a new custom habit. */
  habit?: Habit;
  rule?: HabitRule;
  onCreated?: (habit: Habit) => void;
}

/**
 * Create a custom habit or edit an existing one. The type is locked once a
 * habit exists (its logs depend on it); rule changes are versioned so past
 * periods keep the rule they were scored with.
 */
export function HabitEditorSheet({ visible, onClose, habit, rule, onCreated }: HabitEditorSheetProps) {
  const c = useColors();
  const { actions, state } = useTracker();
  const units = state.settings.units;
  const [d, setD] = useState<HabitDraft>(() => draftFrom(habit, rule));
  // Set once the person touches the freezes: from then on the cadence stops moving them. (Not
  // "equal to the default": a chosen 2 on a weekly habit is the daily default too, and would be
  // moved to 0 by a switch to monthly.) An existing habit's freezes are its own from the start.
  const [freezesTouched, setFreezesTouched] = useState(!!habit);
  const editing = !!habit;
  const preset = !!habit?.presetId;

  useEffect(() => {
    if (visible) {
      setD(draftFrom(habit, rule));
      setFreezesTouched(!!habit);
    }
  }, [visible, habit, rule]);

  const set = (patch: Partial<HabitDraft>) => setD((prev) => ({ ...prev, ...patch }));
  const setType = (type: HabitType) => set({ type, unit: DEFAULT_UNIT[type], target: type === 'YES_NO' ? 1 : type === 'TIMER' ? 10 : type === 'AMOUNT' ? 500 : 3 });

  const periodNoun = d.cadence === 'WEEKLY' ? 'week' : 'month';
  const targetStep = d.type === 'AMOUNT' ? (d.unit === 'ml' ? 250 : 1) : d.type === 'TIMER' ? 5 : 1;
  // The Water target is also the water goal setting; both sides accept 100 ml to 20 l a day.
  const isWater = habit?.presetId === 'water';
  const targetMin = isWater ? WATER_GOAL_MIN_ML : targetStep;
  const targetMax = isWater ? WATER_GOAL_MAX_ML : 100_000;
  const perDay = d.cadence === 'DAILY' ? 'a day' : 'on each counted day';
  const canSave = d.name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    if (habit) {
      actions.saveHabit(habit, d);
    } else {
      const created = actions.createHabit(d);
      onCreated?.(created);
    }
    onClose();
  };

  return (
    <Sheet visible={visible} title={editing ? 'Edit habit' : 'New habit'} onClose={onClose}>
      <View style={{ gap: 18 }}>
        <Field label="Name">
          <TextInput
            value={d.name}
            onChangeText={(name) => set({ name })}
            placeholder="Floss, read 10 pages…"
            placeholderTextColor={c.textTertiary}
            maxLength={80}
            style={[TYPE.body, styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.hairline }]}
            accessibilityLabel="Habit name"
            returnKeyType="done"
            onSubmitEditing={save}
          />
        </Field>

        {!editing ? (
          <Field label="How you log it">
            <View style={styles.wrap}>
              {TYPE_OPTIONS.map((o) => (
                <Chip key={o.value} label={o.label} selected={d.type === o.value} onPress={() => setType(o.value)} />
              ))}
            </View>
            <Txt role="caption" tone="tertiary" style={{ marginTop: 6 }}>
              {TYPE_OPTIONS.find((o) => o.value === d.type)?.hint}
              {' · '}cannot be changed later
            </Txt>
          </Field>
        ) : null}

        {d.type !== 'YES_NO' ? (
          <Field label={`Target ${perDay}`}>
            {/* Wraps on narrow phones: the unit box and the stepper each keep their full width. */}
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 10 }}>
              {preset || d.type === 'TIMER' ? (
                <Txt role="body" tone="secondary">
                  {isWater ? units : d.unit}
                </Txt>
              ) : (
                <TextInput
                  value={d.unit}
                  onChangeText={(unit) => set({ unit })}
                  placeholder="unit"
                  placeholderTextColor={c.textTertiary}
                  maxLength={12}
                  style={[TYPE.body, styles.input, styles.unitInput, { color: c.text, backgroundColor: c.surface, borderColor: c.hairline }]}
                  accessibilityLabel="Unit"
                />
              )}
              {/* The unit is shown once, on the left; the stepper keeps to the number so "1,750 ml" fits beside it. */}
              {isWater ? (
                // The water goal is kept in ml and shown in the units setting; typed ounces are read as ounces.
                <Stepper
                  value={d.target}
                  onChange={(target) => set({ target })}
                  step={targetStep}
                  min={targetMin}
                  max={targetMax}
                  label={`target in ${units}`}
                  format={(v) => formatVolume(v, units).value}
                  parse={(text) => parseVolumeInput(text, units)}
                  keyboardType="decimal-pad"
                  inputKind="amount"
                />
              ) : (
                <Stepper value={d.target} onChange={(target) => set({ target })} step={targetStep} min={targetMin} max={targetMax} label={`target in ${d.unit || 'times'}`} format={formatNumber} />
              )}
            </Row>
          </Field>
        ) : null}

        <Field label="How often">
          <Segmented<Cadence>
            options={CADENCE_OPTIONS}
            value={d.cadence}
            onChange={(cadence) =>
              set({
                cadence,
                timesPerPeriod: cadence === 'WEEKLY' ? Math.min(d.timesPerPeriod, 7) : d.timesPerPeriod,
                // The freezes follow the cadence's default until the person sets them by hand.
                freezesPerMonth: freezesTouched ? d.freezesPerMonth : defaultFreezes(cadence),
              })
            }
          />
          {d.cadence !== 'DAILY' ? (
            <Row style={{ justifyContent: 'space-between', marginTop: 12 }}>
              <Txt role="body" tone="secondary">
                Days per {periodNoun}
              </Txt>
              <Stepper value={d.timesPerPeriod} onChange={(timesPerPeriod) => set({ timesPerPeriod })} min={1} max={d.cadence === 'WEEKLY' ? 7 : 31} label={`days per ${periodNoun}`} />
            </Row>
          ) : null}
          {editing ? (
            <Txt role="caption" tone="tertiary" style={{ marginTop: 8 }}>
              {d.cadence === rule?.cadence ? 'Changes apply from today; past days keep the old rule.' : 'A new rhythm starts with the next period.'}
            </Txt>
          ) : null}
        </Field>

        <Field label="Streak freezes">
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt role="body" tone="secondary">
                Missed {d.cadence === 'DAILY' ? 'days' : periodNoun + 's'} forgiven each month
              </Txt>
            </View>
            <Stepper
              value={d.freezesPerMonth}
              onChange={(freezesPerMonth) => {
                setFreezesTouched(true);
                set({ freezesPerMonth });
              }}
              min={0}
              max={5}
              label="freezes per month"
            />
          </Row>
        </Field>

        {!preset ? (
          <Field label="Category">
            <View style={styles.wrap}>
              {CATEGORIES.map((k) => (
                <Chip key={k} label={CATEGORY_LABELS[k]} color={c.cat[k]} selected={d.category === k} onPress={() => set({ category: k })} />
              ))}
            </View>
          </Field>
        ) : null}

        <Field label="Icon">
          <View style={styles.wrap}>
            {ICON_OPTIONS.map((k) => (
              <PressableScale key={k} onPress={() => set({ icon: k })} accessibilityRole="button" accessibilityLabel={`Icon ${k}`} accessibilityState={{ selected: d.icon === k }} style={[styles.iconChoice, { borderColor: d.icon === k ? c.green : 'transparent' }]}>
                <IconTile icon={k} color={c.cat[d.category]} size={40} />
              </PressableScale>
            ))}
          </View>
        </Field>

        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Txt role="title2">Pin to Today</Txt>
            <Txt role="footnote" tone="secondary">
              Keeps this habit near the top
            </Txt>
          </View>
          <Switch value={d.pinned} onValueChange={(pinned) => set({ pinned })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Pin to Today" />
        </Row>

        <PillButton label={editing ? 'Save changes' : 'Create habit'} onPress={save} disabled={!canSave} Leading={editing ? UI.Check : UI.Plus} />
      </View>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Txt role="footnote" tone="secondary" style={{ marginBottom: 8 }}>
        {label}
      </Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  unitInput: {
    width: 110,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconChoice: {
    borderRadius: 14,
    borderWidth: 2,
    padding: 2, // 40 dp tile + 2 + 2 border = 48 dp target
  },
});
