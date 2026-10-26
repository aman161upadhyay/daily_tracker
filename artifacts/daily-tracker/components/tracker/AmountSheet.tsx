import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { TYPE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import type { Habit } from '@/src/domain/models';
import { MAX_WATER_LOG_ML } from '@/src/data/validate';
import { formatDayLong, formatNumber, formatVolume, mlToOz, ozToMl, parseDecimalInput } from '@/src/domain/time/format';
import { MAX_SNACKS_PER_LOG, useTracker } from '@/src/state/TrackerProvider';
import { UI } from '../ui/icons';
import { Chip, PillButton, Row } from '../ui/primitives';
import { Sheet } from '../ui/Sheet';
import { showToast } from '../ui/Toast';
import { Txt } from '../ui/Txt';
import { confirmDestructive } from '../ui/confirm';

export interface AmountSheetProps {
  visible: boolean;
  onClose: () => void;
  habit: Habit;
  /** 'add' logs on top of the day; 'set' replaces the day's total (backfill). */
  mode?: 'add' | 'set';
  /** Tracking day; defaults to today. */
  day?: string;
  /** Current total for the day (prefills 'set' mode). */
  current?: number;
}

/** Quick values that make sense for the habit's unit. */
export function quickValues(habit: Habit, target: number): number[] {
  if (habit.presetId === 'water') return [150, 250, 350, 500];
  if (habit.mindKind || habit.type === 'TIMER') return [5, 10, 15, 20];
  if (habit.unit === 'steps') return [1000, 2000, 5000, 10000];
  if (habit.type === 'COUNT') return Array.from(new Set([1, 2, 5, 10, target].filter((v) => v > 0))).sort((a, b) => a - b).slice(0, 5);
  const base = Math.max(1, target);
  return Array.from(new Set([Math.round(base / 4), Math.round(base / 2), base, base * 2].filter((v) => v > 0)));
}

/** Largest single amount accepted (a million of any unit), well inside what an export file allows. */
export const MAX_AMOUNT = 1_000_000;

/**
 * Snack habits store one row per snack, so their cap is the per-log row limit, not a million; a
 * drink stops at the shared single-drink ceiling (the same one the notification buttons keep).
 */
export function maxAmountFor(habit: Habit): number {
  if (habit.snackType) return MAX_SNACKS_PER_LOG;
  if (habit.presetId === 'water') return MAX_WATER_LOG_ML;
  return MAX_AMOUNT;
}

export function AmountSheet({ visible, onClose, habit, mode = 'add', day, current = 0 }: AmountSheetProps) {
  const c = useColors();
  const { state, actions, today } = useTracker();
  const units = state.settings.units;
  const isWater = habit.presetId === 'water';
  const rule = state.rules.filter((r) => r.habitId === habit.id).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  const target = rule?.target ?? 1;
  const [text, setText] = useState('');
  const quick = useMemo(() => quickValues(habit, target), [habit, target]);
  const theDay = day ?? today;
  const backfill = theDay !== today;

  // Typed values are in the display unit; water is stored in ml.
  const toStored = (v: number) => (isWater && units === 'oz' ? Math.round(ozToMl(v)) : v);
  const toDisplay = (v: number) => (isWater && units === 'oz' ? Math.round(mlToOz(v) * 10) / 10 : v);
  const typedUnit = isWater ? units : habit.unit;

  useEffect(() => {
    if (visible) setText(mode === 'set' && current > 0 ? String(toDisplay(current)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode, current]);

  const label = (v: number) => {
    if (isWater) {
      const f = formatVolume(v, units);
      return `${f.value} ${f.unit}`;
    }
    return `${formatNumber(v)} ${habit.unit}`.trim();
  };

  const maxAmount = maxAmountFor(habit);
  const commit = (value: number) => {
    if (!Number.isFinite(value) || value < 0 || value > maxAmount) return;
    if (mode === 'set') actions.setDayValue(habit, value, theDay);
    else if (value > 0) actions.logAmount(habit, value, theDay);
    onClose();
  };

  // An untouched prefill keeps the exact stored value: 250 ml shows as 8.5 oz, and 8.5 oz would
  // otherwise come back as 251 ml just from opening the sheet and pressing Set.
  const prefilled = mode === 'set' && current > 0 && text === String(toDisplay(current));
  const parsed = prefilled ? current : toStored(parseDecimalInput(text) ?? NaN);
  const tooLarge = Number.isFinite(parsed) && parsed > maxAmount;
  // "Set" to 0 clears the day; "Log" 0 would log nothing, so the button waits for a number.
  const typedValid = text.trim().length > 0 && Number.isFinite(parsed) && (mode === 'set' ? parsed >= 0 : parsed > 0) && !tooLarge;
  const title = mode === 'set' ? (backfill ? 'Set the day’s total' : 'Set today’s total') : `Log ${habit.name}`;
  const subtitle = backfill ? formatDayLong(theDay) : 'Today';

  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <Txt role="footnote" tone="secondary" style={{ marginBottom: 12 }}>
        {subtitle}
        {mode === 'set' ? ` · currently ${label(current)}` : ''}
      </Txt>
      <View style={styles.wrap}>
        {quick.map((v) => (
          <Chip key={v} label={mode === 'add' ? `+${label(v)}` : label(v)} color={c.cat[habit.category]} Leading={isWater ? UI.Drop : undefined} onPress={() => commit(v)} />
        ))}
        {mode === 'set' && current > 0 ? (
          <Chip
            label="Clear day"
            onPress={() =>
              // Clearing takes every record of that day with it (times and origins included), not
              // only the total: named and confirmed, like Remove in the Logged list.
              confirmDestructive(`Clear ${backfill ? formatDayLong(theDay) : 'today'}?`, `Removes everything logged for ${habit.name} that day (${label(current)}), entry by entry. Undo is offered afterwards.`, 'Clear day', () => {
                // The cleared records come back exactly on Undo (their times and origins with them).
                const gone = actions.clearDay(habit, theDay);
                onClose();
                if (gone.length > 0) showToast({ message: `Cleared ${label(current)} ${backfill ? `on ${formatDayLong(theDay)}` : 'today'}`, actionLabel: 'Undo', onAction: () => actions.restoreLogs(gone) });
              })
            }
          />
        ) : null}
      </View>
      <Row gap={8} style={{ marginTop: 16 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={`Custom ${typedUnit || 'amount'}`.trim()}
          placeholderTextColor={c.textTertiary}
          keyboardType="decimal-pad"
          style={[TYPE.body, styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.hairline, flex: 1 }]}
          accessibilityLabel="Custom amount"
          returnKeyType="done"
          onSubmitEditing={() => typedValid && commit(parsed)}
        />
        <PillButton label={mode === 'set' ? 'Set' : 'Log'} onPress={() => commit(parsed)} disabled={!typedValid} />
      </Row>
      {tooLarge ? (
        <Txt role="caption" tone="tertiary" style={{ marginTop: 6 }}>
          {/* The cap in the unit being typed: 1,000,000 ml reads as 33,814 oz when the sheet is in ounces. */}
          {`That is more than ${formatNumber(Math.floor(toDisplay(maxAmount)))}${typedUnit ? ` ${typedUnit}` : ''} — check the number.`}
        </Txt>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
});
