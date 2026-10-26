import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { confirmDestructive } from '@/components/ui/confirm';
import { Sheet } from '@/components/ui/Sheet';
import { Chip, PillButton, Row, Segmented, Stepper } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { TYPE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { describeReminder } from '@/src/domain/cycle/reminders';
import type { CyclePhaseKey, CycleReminder } from '@/src/domain/models';
import { formatClock, parseClockInput } from '@/src/domain/time/format';

export interface ReminderSheetProps {
  /** The rule being edited; `null` closes the sheet. A rule with an empty id is new. */
  reminder: CycleReminder | null;
  birthControl: boolean;
  onClose: () => void;
  onSave: (rule: CycleReminder) => void;
  onDelete: (id: string) => void;
}

const PHASES: { value: CyclePhaseKey; label: string }[] = [
  { value: 'period', label: 'Period' },
  { value: 'fertile', label: 'Fertile window' },
  { value: 'luteal', label: 'Luteal phase' },
];

/** Edit one cycle-relative reminder: label, anchor, offset, time, on/off. */
export function ReminderSheet({ reminder, birthControl, onClose, onSave, onDelete }: ReminderSheetProps) {
  const c = useColors();
  const [draft, setDraft] = useState<CycleReminder | null>(reminder);
  useEffect(() => setDraft(reminder), [reminder]);
  if (!reminder || !draft) return null;
  const isNew = reminder.id === '';
  // Hormonal birth control: nothing to count ovulation from, so only period-anchored phases are offered.
  const phases = birthControl ? PHASES.filter((p) => p.value === 'period') : PHASES;

  return (
    <Sheet visible={!!reminder} title={isNew ? 'New cycle reminder' : 'Edit reminder'} onClose={onClose}>
      <Txt role="title2" style={styles.label}>
        Name
      </Txt>
      <TextInput
        value={draft.label}
        onChangeText={(label) => setDraft({ ...draft, label })}
        placeholder="Vitamin C"
        placeholderTextColor={c.textTertiary}
        style={[TYPE.body, styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.hairline }]}
        accessibilityLabel="Reminder name"
      />

      <Txt role="title2" style={styles.label}>
        When
      </Txt>
      <Segmented
        options={[
          { value: 'BEFORE_PERIOD', label: 'Before the period' },
          { value: 'PHASE_START', label: 'Into a phase' },
        ]}
        value={draft.anchor}
        onChange={(anchor) => setDraft({ ...draft, anchor, ...(anchor === 'PHASE_START' && !draft.phase ? { phase: (birthControl ? 'period' : 'luteal') as CyclePhaseKey } : {}) })}
      />
      {draft.anchor === 'PHASE_START' ? (
        <Row gap={8} style={{ flexWrap: 'wrap', marginTop: 10 }}>
          {phases.map((p) => (
            <Chip key={p.value} label={p.label} color={c.cat.cycle} selected={(draft.phase ?? (birthControl ? 'period' : 'luteal')) === p.value} onPress={() => setDraft({ ...draft, phase: p.value })} />
          ))}
        </Row>
      ) : null}
      <Row style={styles.row}>
        <View style={{ flex: 1 }}>
          <Txt role="body">{draft.anchor === 'BEFORE_PERIOD' ? 'Days before' : 'Days into the phase'}</Txt>
          <Txt role="footnote" tone="secondary">
            {describeReminder(draft)}
          </Txt>
        </View>
        <Stepper value={draft.offsetDays} onChange={(offsetDays) => setDraft({ ...draft, offsetDays })} min={0} max={14} label="days" />
      </Row>
      <Row style={styles.row}>
        <View style={{ flex: 1 }}>
          <Txt role="body">Time</Txt>
        </View>
        <Stepper value={draft.minute} onChange={(minute) => setDraft({ ...draft, minute })} step={30} min={0} max={23 * 60 + 30} format={formatClock} parse={parseClockInput} label="time" />
      </Row>
      <Row style={styles.row}>
        <Txt role="body" style={{ flex: 1 }}>
          Enabled
        </Txt>
        <Switch value={draft.enabled} onValueChange={(enabled) => setDraft({ ...draft, enabled })} trackColor={{ false: c.hairline, true: c.green }} thumbColor={c.text} accessibilityLabel="Reminder enabled" />
      </Row>

      <Row gap={8} style={{ marginTop: 16 }}>
        {!isNew ? (
          <PillButton
            label="Delete"
            kind="danger"
            onPress={() =>
              confirmDestructive('Delete this reminder?', `"${reminder.label}" will no longer be scheduled.`, 'Delete', () => {
                onDelete(reminder.id);
                onClose();
              })
            }
          />
        ) : null}
        <PillButton
          label="Save"
          disabled={draft.label.trim().length === 0}
          onPress={() => {
            onSave({ ...draft, label: draft.label.trim() });
            onClose();
          }}
          style={{ flex: 1 }}
        />
      </Row>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: 12,
    marginBottom: 8,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  row: {
    minHeight: 56,
    paddingVertical: 8,
  },
});
