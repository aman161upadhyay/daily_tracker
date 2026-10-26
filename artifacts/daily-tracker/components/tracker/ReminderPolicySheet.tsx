import React, { useEffect, useState } from 'react';
import { confirmDestructive } from '../ui/confirm';
import { Divider, PillButton, Row } from '../ui/primitives';
import { Sheet } from '../ui/Sheet';
import { Txt } from '../ui/Txt';
import type { Habit, NudgePolicy } from '@/src/domain/models';
import { isPaused, type PolicyContext } from '@/src/domain/nudges/describePolicy';
import { ReminderPolicyForm, policyDraftFrom, policyFromPolicyDraft, type PolicyDraft } from './ReminderPolicyForm';

export interface ReminderPolicySheetProps {
  visible: boolean;
  onClose: () => void;
  habit: Habit;
  policy: NudgePolicy | undefined;
  context: PolicyContext;
  onSave: (policy: NudgePolicy) => void;
}

/**
 * Tune how a habit reminds: set clock times, an interval, the movement rotation, or nothing;
 * how many a day at most; whether it stays quiet while the habit is on pace. Any habit, preset or
 * custom — the presets only start with a sensible default. The fields themselves are the shared
 * `ReminderPolicyForm`, which the habit creation sheet also shows.
 */
export function ReminderPolicySheet({ visible, onClose, habit, policy, context, onSave }: ReminderPolicySheetProps) {
  const [d, setD] = useState<PolicyDraft>(() => policyDraftFrom(policy, context));
  // The policy the sheet opened with, as data: Back, the scrim, Close and Cancel ask before edits are lost.
  const opening = () => JSON.stringify(policyFromPolicyDraft({ habitId: habit.id, ...policy }, policyDraftFrom(policy, context), context));
  const [initial, setInitial] = useState(opening);
  useEffect(() => {
    if (visible) {
      setD(policyDraftFrom(policy, context));
      setInitial(opening());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, policy]);
  const preview = policyFromPolicyDraft({ habitId: habit.id, ...policy }, d, context);
  const paused = isPaused(policy) && d.mode !== 'NONE';
  const dirty = JSON.stringify(preview) !== initial;
  const requestClose = () => {
    if (dirty) confirmDestructive('Discard changes?', 'The reminder edits are not saved.', 'Discard', onClose);
    else onClose();
  };

  return (
    <Sheet visible={visible} title="Reminders" onClose={requestClose}>
      <Txt role="footnote" tone="secondary" style={{ marginBottom: 8 }}>
        {habit.name}
      </Txt>
      <ReminderPolicyForm draft={d} onChange={setD} context={context} preview={preview} />
      {paused ? (
        <Txt role="footnote" tone="tertiary" style={{ marginTop: 6 }}>
          Paused: Save keeps the schedule, the switch on the habit page turns it back on.
        </Txt>
      ) : null}

      <Divider />
      <Row gap={8} style={{ marginTop: 16 }}>
        <PillButton label="Cancel" kind="ghost" onPress={requestClose} />
        <PillButton
          label="Save"
          onPress={() => {
            onSave(preview);
            onClose();
          }}
          style={{ flex: 1 }}
        />
      </Row>
    </Sheet>
  );
}
