/**
 * The symptom, mood and flow vocabularies of the day sheet. Keys are stored
 * in `CycleDayLog`, so they are permanent: append, never rename.
 */
import type { Flow, Mood, Severity } from '../models';

export interface SymptomDef {
  key: string;
  label: string;
  /** Short form for dense rows ("Cramps" → "cramps"). */
  group: 'body' | 'head' | 'mood' | 'skin' | 'other';
}

export const SYMPTOMS: readonly SymptomDef[] = [
  { key: 'cramps', label: 'Cramps', group: 'body' },
  { key: 'bloating', label: 'Bloating', group: 'body' },
  { key: 'tender-breasts', label: 'Tender breasts', group: 'body' },
  { key: 'backache', label: 'Backache', group: 'body' },
  { key: 'headache', label: 'Headache', group: 'head' },
  { key: 'nausea', label: 'Nausea', group: 'body' },
  { key: 'fatigue', label: 'Fatigue', group: 'body' },
  { key: 'cravings', label: 'Cravings', group: 'other' },
  { key: 'acne', label: 'Acne', group: 'skin' },
  { key: 'irritability', label: 'Irritability', group: 'mood' },
  { key: 'anxiety', label: 'Anxiety', group: 'mood' },
  { key: 'low-mood', label: 'Low mood', group: 'mood' },
  { key: 'poor-sleep', label: 'Poor sleep', group: 'other' },
  { key: 'spotting', label: 'Spotting', group: 'other' },
];

export const SYMPTOM_BY_KEY: Record<string, SymptomDef> = Object.fromEntries(SYMPTOMS.map((s) => [s.key, s]));

export function symptomLabel(key: string): string {
  return SYMPTOM_BY_KEY[key]?.label ?? key;
}

export const SEVERITY_LABELS: Record<Severity, string> = { 1: 'Mild', 2: 'Moderate', 3: 'Severe' };

export const MOODS: readonly { value: Mood; label: string }[] = [
  { value: 5, label: 'Great' },
  { value: 4, label: 'Good' },
  { value: 3, label: 'Okay' },
  { value: 2, label: 'Low' },
  { value: 1, label: 'Rough' },
];

export const MOOD_LABELS: Record<Mood, string> = { 5: 'Great', 4: 'Good', 3: 'Okay', 2: 'Low', 1: 'Rough' };

export const FLOWS: readonly { value: Flow; label: string }[] = [
  { value: 1, label: 'Light' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Heavy' },
];

export const FLOW_LABELS: Record<Flow, string> = { 1: 'Light', 2: 'Medium', 3: 'Heavy' };

/** Next severity when the user taps a symptom chip: none → mild → moderate → severe → none. */
export function nextSeverity(current: Severity | undefined): Severity | undefined {
  if (current === undefined) return 1;
  if (current === 3) return undefined;
  return (current + 1) as Severity;
}

/** A log with nothing in it is deleted rather than stored. */
export function isEmptyLog(log: { flow?: Flow; mood?: Mood; symptoms: Record<string, Severity>; note?: string }): boolean {
  return log.flow === undefined && log.mood === undefined && Object.keys(log.symptoms).length === 0 && !(log.note && log.note.trim().length > 0);
}
