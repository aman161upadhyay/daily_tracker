import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { TYPE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { SNACK_LABELS, type MindKind, type SnackType } from '@/src/domain/models';
import { MAX_WATER_LOG_ML } from '@/src/data/validate';
import { formatVolume, parseVolumeInput } from '@/src/domain/time/format';
import { useTracker } from '@/src/state/TrackerProvider';
import { rotationItems, snackSuggestion } from '@/src/state/selectors';
import { Sheet } from '../ui/Sheet';
import { Chip, PillButton, Row } from '../ui/primitives';
import { Txt } from '../ui/Txt';
import { UI } from '../ui/icons';

const WATER_ML = [150, 250, 350, 500];
const MIND_MIN = [5, 10, 13, 20];

/** Bottom sheet for logging: water amounts, movement snacks, the Sugar Shield, mind sessions. */
export function QuickLogSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const router = useRouter();
  const { state, actions } = useTracker();
  const units = state.settings.units;
  const snackTypes = Array.from(new Set(rotationItems(state).map((i) => i.snackType))) as SnackType[];
  const allSnacks = snackTypes.length > 0 ? snackTypes : (Object.keys(SNACK_LABELS) as SnackType[]).slice(0, 4);
  const mindKinds: { kind: MindKind; label: string }[] = [
    { kind: 'MEDITATION', label: 'Meditation' },
    { kind: 'BREATHING', label: 'Breathing' },
  ];

  const [custom, setCustom] = useState('');
  useEffect(() => {
    if (visible) setCustom('');
  }, [visible]);

  const logWater = (ml: number | null) => {
    if (ml === null || ml <= 0 || ml > MAX_WATER_LOG_ML) return;
    actions.addWater(ml);
    onClose();
  };
  // The same parser as every other volume field: "1,850" is 1,850 ml, "8,5" on a decimal-comma keyboard is 8.5.
  const customMl = parseVolumeInput(custom, units);
  const tooLarge = customMl !== null && customMl > MAX_WATER_LOG_ML;
  const customValid = customMl !== null && customMl > 0 && !tooLarge;
  const ceiling = formatVolume(MAX_WATER_LOG_ML, units);

  return (
    <Sheet visible={visible} title="Log" onClose={onClose}>
      <Group title="Water" color={c.cat.hydration}>
        {WATER_ML.map((ml) => {
          const v = formatVolume(ml, units);
          return <Chip key={ml} label={`+${v.value} ${v.unit}`} color={c.cat.hydration} Leading={UI.Drop} onPress={() => logWater(ml)} />;
        })}
        <Row gap={8} style={{ width: '100%', marginTop: 4 }}>
          <TextInput
            value={custom}
            onChangeText={setCustom}
            placeholder={`Custom ${units}`}
            placeholderTextColor={c.textTertiary}
            keyboardType="decimal-pad"
            style={[TYPE.body, styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.hairline, flex: 1, minWidth: 0 }]}
            accessibilityLabel={`Custom water amount in ${units}`}
            returnKeyType="done"
            onSubmitEditing={() => customValid && logWater(customMl)}
          />
          <PillButton label="Log" compact onPress={() => logWater(customMl)} disabled={!customValid} style={{ flexShrink: 0 }} />
        </Row>
        {tooLarge ? (
          <Txt role="caption" tone="danger" style={{ marginTop: 6 }} accessibilityLiveRegion="polite">
            {`That is more than ${ceiling.value} ${ceiling.unit} in one go — check the number.`}
          </Txt>
        ) : null}
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
      <Group title="Before something sweet" color={c.gold}>
        <Chip
          label="Sugar Shield · 60 s of squats"
          color={c.gold}
          Leading={UI.Cookie}
          onPress={() => {
            onClose();
            router.push('/shield');
          }}
        />
      </Group>
      {mindKinds.map((m) => (
        <Group key={m.kind} title={m.label} color={c.cat.mind}>
          {MIND_MIN.map((min) => (
            <Chip
              key={min}
              label={`${min} min`}
              accessibilityLabel={`Log ${min} ${min === 1 ? 'minute' : 'minutes'} of ${m.label.toLowerCase()}`}
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
      <Txt role="callout" color={color} heading style={{ marginBottom: 8 }}>
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
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
});
