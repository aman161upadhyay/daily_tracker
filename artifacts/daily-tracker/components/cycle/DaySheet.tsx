import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';
import { Sheet } from '@/components/ui/Sheet';
import { Chip, Divider, PillButton, Row } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { TYPE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { FLOWS, isEmptyLog, MOODS, nextSeverity, SEVERITY_LABELS, SYMPTOMS } from '@/src/domain/cycle/symptoms';
import { displayPhase, OPEN_PERIOD_MAX_DAYS, PHASE_LABELS, type CycleTimeline } from '@/src/domain/cycle/timeline';
import type { CycleDayLog, Flow, Mood, Severity } from '@/src/domain/models';
import { formatDayLong, formatDayShort } from '@/src/domain/time/format';
import { dayDiff } from '@/src/domain/time/trackingDay';
import { MAX_TEXT as MAX_NOTE_CHARS } from '@/src/data/validate';

export interface DaySheetProps {
  day: string | null;
  today: string;
  timeline: CycleTimeline;
  birthControl: boolean;
  log: CycleDayLog | undefined;
  onClose: () => void;
  onSave: (log: CycleDayLog) => void;
  /** Period edits for this day; each returns an error message to show, or null. */
  onPeriodStart: (day: string) => string | null;
  /** Make `day` the last day of the period that started on `start` (sets or moves its end). */
  onPeriodEnd: (day: string, start: string) => void;
  onRemovePeriod: (start: string) => void;
}

const EMPTY = (day: string): CycleDayLog => ({ day, symptoms: {} });

/**
 * The day sheet: period actions for the day, flow, mood, symptoms with a
 * tap-to-cycle severity (mild → moderate → severe → off), and a note.
 * Saves on close; an empty sheet deletes the day's log.
 */
export function DaySheet({ day, today, timeline, birthControl, log, onClose, onSave, onPeriodStart, onPeriodEnd, onRemovePeriod }: DaySheetProps) {
  const c = useColors();
  const [draft, setDraft] = useState<CycleDayLog>(log ?? EMPTY(day ?? today));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (day) setDraft(log ?? EMPTY(day));
    setError(null);
  }, [day, log]);

  if (!day) return null;
  const info = timeline.infoOn(day);
  const period = timeline.periodContaining(day);
  const future = day > today;
  const phaseLabel = info ? PHASE_LABELS[displayPhase(info.phase, birthControl)] : undefined;
  const subtitle = [phaseLabel ? `${phaseLabel}${info?.predicted ? ' (predicted)' : ''}` : null, info ? `cycle day ${info.cycleDay}` : null].filter(Boolean).join(' · ');

  const saveDraft = () => {
    const changed = JSON.stringify(draft) !== JSON.stringify(log ?? EMPTY(day));
    if (changed || (log && isEmptyLog(draft))) onSave(draft);
  };
  const close = () => {
    saveDraft();
    onClose();
  };
  // Period buttons keep whatever flow / mood / symptoms were already tapped: they save the draft first.
  const removePeriod = (start: string) => {
    const go = () => {
      saveDraft();
      onRemovePeriod(start);
      onClose();
    };
    if (Platform.OS === 'web') return go();
    Alert.alert('Remove this period?', `The period that started ${formatDayShort(start)} is taken out of your history. Day notes and symptoms stay.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: go },
    ]);
  };

  const setSymptom = (key: string) => {
    const next = nextSeverity(draft.symptoms[key]);
    const symptoms: Record<string, Severity> = { ...draft.symptoms };
    if (next === undefined) delete symptoms[key];
    else symptoms[key] = next;
    setDraft({ ...draft, symptoms });
  };

  // The period this day could end: the latest one that started by this day — open or already
  // closed (a tap on a later day extends it, on an earlier day shortens it) — as long as the next
  // period has not started yet and the period stays within the longest length accepted.
  const started = [...timeline.history].reverse().find((s) => s.start <= day);
  const following = started ? timeline.history.find((s) => s.start > started.start) : undefined;
  const canEnd =
    !!started && !future && day > started.start && started.end !== day && dayDiff(started.start, day) <= OPEN_PERIOD_MAX_DAYS - 1 && (!following || following.start > day);

  return (
    <Sheet visible={!!day} title={formatDayLong(day)} onClose={close}>
      {subtitle ? (
        <Txt role="footnote" tone="secondary" style={{ marginBottom: 12 }}>
          {subtitle}
        </Txt>
      ) : null}

      {!future ? (
        <Row gap={8} style={{ flexWrap: 'wrap', marginBottom: 14 }}>
          {period && period.start === day ? (
            <PillButton
              label="Remove this period"
              kind="danger"
              compact
              onPress={() => removePeriod(period.start)}
            />
          ) : period ? (
            <Txt role="footnote" tone="secondary">
              {`Day ${dayDiff(period.start, day) + 1} of the period that started ${formatDayShort(period.start)}.`}
            </Txt>
          ) : (
            <PillButton
              label="Period started here"
              color={c.cat.cycle}
              compact
              onPress={() => {
                const reason = onPeriodStart(day);
                if (reason) setError(reason);
                else close();
              }}
            />
          )}
          {canEnd ? (
            <PillButton
              label={started.end ? (day > started.end ? 'Period lasted until here' : 'Period ended here instead') : 'Period ended here'}
              kind="ghost"
              compact
              onPress={() => {
                onPeriodEnd(day, started.start);
                close();
              }}
            />
          ) : null}
        </Row>
      ) : (
        <Txt role="footnote" tone="secondary" style={{ marginBottom: 14 }}>
          A period is logged on the day it starts. Symptoms and a note can go in ahead of time.
        </Txt>
      )}
      {error ? (
        <Txt role="footnote" color={c.danger} style={{ marginBottom: 12 }}>
          {error}
        </Txt>
      ) : null}

      <Txt role="title2" style={styles.label}>
        Flow
      </Txt>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {FLOWS.map((f) => (
          <Chip key={f.value} label={f.label} color={c.cat.cycle} selected={draft.flow === f.value} onPress={() => setDraft({ ...draft, flow: draft.flow === f.value ? undefined : (f.value as Flow) })} />
        ))}
      </Row>

      <Txt role="title2" style={styles.label}>
        Mood
      </Txt>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {MOODS.map((m) => (
          <Chip key={m.value} label={m.label} color={c.violetSoft} selected={draft.mood === m.value} onPress={() => setDraft({ ...draft, mood: draft.mood === m.value ? undefined : (m.value as Mood) })} />
        ))}
      </Row>

      <Txt role="title2" style={styles.label}>
        Symptoms
      </Txt>
      <Txt role="footnote" tone="tertiary" style={{ marginBottom: 8 }}>
        Tap to cycle: mild, moderate, severe, off.
      </Txt>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {SYMPTOMS.map((s) => {
          const sev = draft.symptoms[s.key];
          // Defensive: a value the validator did not see (an old file) renders as plain "on".
          const sevLabel = sev ? (SEVERITY_LABELS[sev] ?? 'on') : '';
          return (
            <Chip
              key={s.key}
              label={sev ? `${s.label} · ${sevLabel.toLowerCase()}` : s.label}
              color={c.gold}
              selected={!!sev}
              onPress={() => setSymptom(s.key)}
              accessibilityLabel={sev ? `${s.label}, ${sevLabel}` : s.label}
            />
          );
        })}
      </Row>

      <Divider />
      <Txt role="title2" style={styles.label}>
        Note
      </Txt>
      <TextInput
        value={draft.note ?? ''}
        onChangeText={(note) => setDraft({ ...draft, note })}
        placeholder="Anything worth remembering"
        placeholderTextColor={c.textTertiary}
        multiline
        maxLength={MAX_NOTE_CHARS}
        style={[TYPE.body, styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.hairline }]}
        accessibilityLabel="Note"
      />
      <PillButton label="Done" onPress={close} style={{ marginTop: 16 }} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
});
