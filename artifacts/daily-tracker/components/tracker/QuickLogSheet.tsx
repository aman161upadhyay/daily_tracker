import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { SNACK_LABELS, type MindKind, type SnackType } from '@/src/domain/models';
import { formatVolume } from '@/src/domain/time/format';
import { useTracker } from '@/src/state/TrackerProvider';
import { rotationItems, snackSuggestion } from '@/src/state/selectors';
import { Sheet } from '../ui/Sheet';
import { Chip } from '../ui/primitives';
import { Txt } from '../ui/Txt';
import { UI } from '../ui/icons';

const WATER_ML = [150, 250, 350, 500];
const MIND_MIN = [5, 10, 13, 20];

/** Bottom sheet for logging: water amounts, movement snacks, mind sessions. */
export function QuickLogSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { state, actions } = useTracker();
  const units = state.settings.units;
  const snackTypes = Array.from(new Set(rotationItems(state).map((i) => i.snackType))) as SnackType[];
  const allSnacks = snackTypes.length > 0 ? snackTypes : (Object.keys(SNACK_LABELS) as SnackType[]).slice(0, 4);
  const mindKinds: { kind: MindKind; label: string }[] = [
    { kind: 'MEDITATION', label: 'Meditation' },
    { kind: 'BREATHING', label: 'Breathing' },
  ];

  const logWater = (ml: number) => {
    actions.addWater(ml);
    onClose();
  };

  return (
    <Sheet visible={visible} title="Log" onClose={onClose}>
      <Group title="Water" color={c.cat.hydration}>
        {WATER_ML.map((ml) => {
          const v = formatVolume(ml, units);
          return <Chip key={ml} label={`+${v.value} ${v.unit}`} color={c.cat.hydration} Leading={UI.Drop} onPress={() => logWater(ml)} />;
        })}
      </Group>
      <Group title="Movement snack" color={c.cat.movement}>
        {allSnacks.map((t) => (
          <Chip
            key={t}
            label={snackSuggestion(t)}
            color={c.cat.movement}
            onPress={() => {
              actions.logSnack(t, { trigger: 'MANUAL' });
              onClose();
            }}
          />
        ))}
      </Group>
      {mindKinds.map((m) => (
        <Group key={m.kind} title={m.label} color={c.cat.mind}>
          {MIND_MIN.map((min) => (
            <Chip
              key={min}
              label={`${min} min`}
              color={c.cat.mind}
              onPress={() => {
                actions.logMind(m.kind, min);
                onClose();
              }}
            />
          ))}
        </Group>
      ))}
    </Sheet>
  );
}

function Group({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Txt role="callout" color={color} style={{ marginBottom: 8 }}>
        {title}
      </Txt>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
