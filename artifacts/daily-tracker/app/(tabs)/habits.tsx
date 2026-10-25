import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EvidenceBlock, EvidencePill } from '@/components/tracker/EvidenceBlock';
import { HabitRow } from '@/components/tracker/HabitRow';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Chip, Dot, IconButton, IconTile, PillButton, Row, SectionHeader, Stepper } from '@/components/ui/primitives';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { TYPE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import type { Category, HabitIcon, HabitType } from '@/src/domain/models';
import { CATEGORY_LABELS, CATEGORY_ORDER, PRESETS, type Preset } from '@/src/library/presets';
import { useHabitViews } from '@/src/state/hooks';
import { useTracker } from '@/src/state/TrackerProvider';

export default function HabitsScreen() {
  const c = useColors();
  const router = useRouter();
  const { state, actions } = useTracker();
  const views = useHabitViews();
  const [preset, setPreset] = useState<Preset | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

  const grouped = useMemo(() => {
    const byCat = new Map<Category, typeof views>();
    for (const v of views) {
      const list = byCat.get(v.habit.category) ?? [];
      list.push(v);
      byCat.set(v.habit.category, list);
    }
    return CATEGORY_ORDER.filter((k) => byCat.has(k)).map((k) => ({ key: k, items: byCat.get(k)! }));
  }, [views]);

  const addedIds = new Set(state.habits.filter((h) => !h.archived && h.presetId).map((h) => h.presetId));
  const libraryGroups = CATEGORY_ORDER.map((k) => ({ key: k, items: PRESETS.filter((p) => p.category === k) })).filter((g) => g.items.length > 0);

  const openHabit = (id: string) => router.push({ pathname: '/habit/[id]', params: { id } });

  return (
    <Screen>
      <ScreenHeader title="Habits" right={<IconButton Glyph={UI.Plus} label="New custom habit" onPress={() => setCustomOpen(true)} size={40} filled />} />

      {grouped.length === 0 ? (
        <Card>
          <Txt role="body" tone="secondary">
            Nothing here yet. Pick a few from the Library below; each one comes with its evidence.
          </Txt>
        </Card>
      ) : null}

      {grouped.map((g) => (
        <View key={g.key}>
          <Row gap={8} style={styles.groupHeader}>
            <Dot color={c.cat[g.key]} />
            <Txt role="callout" color={c.cat[g.key]}>
              {CATEGORY_LABELS[g.key]}
            </Txt>
          </Row>
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {g.items.map((v, i) => (
              <HabitRow
                key={v.habit.id}
                view={v}
                last={i === g.items.length - 1}
                onPress={() => openHabit(v.habit.id)}
                onIncrement={() => actions.increment(v.habit)}
                onToggle={() => actions.toggleYesNo(v.habit)}
                onTimer={() => router.push({ pathname: '/mind', params: { kind: v.habit.mindKind ?? 'MEDITATION' } })}
              />
            ))}
          </Card>
        </View>
      ))}

      <SectionHeader title="Library" />
      <Txt role="footnote" tone="secondary" style={{ marginTop: -4, marginBottom: 4, paddingHorizontal: 4 }}>
        Research-backed presets. Tap one to read why it is here before you add it.
      </Txt>

      {libraryGroups.map((g) => (
        <View key={g.key}>
          <Row gap={8} style={styles.groupHeader}>
            <Dot color={c.cat[g.key]} />
            <Txt role="callout" color={c.cat[g.key]}>
              {CATEGORY_LABELS[g.key]}
            </Txt>
          </Row>
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {g.items.map((p, i) => {
              const added = addedIds.has(p.id);
              return (
                <View key={p.id} style={[styles.presetRow, i < g.items.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline } : null]}>
                  <PressableScale
                    haptic={false}
                    scaleTo={0.985}
                    onPress={() => setPreset(p)}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.name}: ${p.ruleText}. ${added ? 'Added' : 'Not added'}`}
                    style={styles.presetMain}
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
                  </PressableScale>
                  {added ? (
                    <View style={[styles.added, { backgroundColor: c.surfaceRaised }]} accessibilityLabel={`${p.name} is in your habits`}>
                      <UI.Check size={16} color={c.greenBright} weight="bold" />
                    </View>
                  ) : (
                    <PillButton
                      label="Add"
                      compact
                      onPress={() => {
                        const h = actions.addPreset(p.id);
                        if (h) openHabit(h.id);
                      }}
                      accessibilityLabel={`Add ${p.name}`}
                    />
                  )}
                </View>
              );
            })}
          </Card>
        </View>
      ))}

      <Sheet visible={!!preset} title={preset?.name ?? ''} onClose={() => setPreset(null)}>
        {preset ? (
          <View style={{ gap: 16 }}>
            <Row gap={12}>
              <IconTile icon={preset.icon} color={c.cat[preset.category]} size={48} />
              <View style={{ flex: 1 }}>
                <Txt role="title2">{preset.ruleText}</Txt>
                <Txt role="footnote" tone="secondary">
                  {preset.nudgeText}
                </Txt>
              </View>
            </Row>
            <EvidenceBlock preset={preset} />
            {addedIds.has(preset.id) ? (
              <PillButton
                label="Open habit"
                kind="ghost"
                onPress={() => {
                  const h = state.habits.find((x) => x.presetId === preset.id);
                  setPreset(null);
                  if (h) openHabit(h.id);
                }}
              />
            ) : (
              <PillButton
                label="Add to my habits"
                Leading={UI.Plus}
                onPress={() => {
                  const h = actions.addPreset(preset.id);
                  setPreset(null);
                  if (h) openHabit(h.id);
                }}
              />
            )}
          </View>
        ) : null}
      </Sheet>

      <CustomHabitSheet visible={customOpen} onClose={() => setCustomOpen(false)} onCreated={openHabit} />
    </Screen>
  );
}

const TYPE_OPTIONS: { value: HabitType; label: string }[] = [
  { value: 'YES_NO', label: 'Yes / no' },
  { value: 'COUNT', label: 'Count' },
];

const ICON_OPTIONS: HabitIcon[] = ['check', 'leaf', 'heart', 'journal', 'barbell', 'drop', 'moon', 'lightning'];

function CustomHabitSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const c = useColors();
  const { actions } = useTracker();
  const [name, setName] = useState('');
  const [type, setType] = useState<HabitType>('YES_NO');
  const [category, setCategory] = useState<Category>('mind');
  const [icon, setIcon] = useState<HabitIcon>('check');
  const [target, setTarget] = useState(3);

  const reset = () => {
    setName('');
    setType('YES_NO');
    setCategory('mind');
    setIcon('check');
    setTarget(3);
  };

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const habit = actions.addCustomHabit({ name: trimmed, type, category, icon, unit: type === 'COUNT' ? 'times' : '', target: type === 'COUNT' ? target : 1 });
    reset();
    onClose();
    onCreated(habit.id);
  };

  return (
    <Sheet visible={visible} title="New habit" onClose={onClose}>
      <View style={{ gap: 16 }}>
        <View>
          <Txt role="footnote" tone="secondary" style={{ marginBottom: 6 }}>
            Name
          </Txt>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Floss, read 10 pages…"
            placeholderTextColor={c.textTertiary}
            style={[TYPE.body, styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.hairline }]}
            accessibilityLabel="Habit name"
            returnKeyType="done"
            onSubmitEditing={create}
          />
        </View>
        <View>
          <Txt role="footnote" tone="secondary" style={{ marginBottom: 6 }}>
            Type
          </Txt>
          <Row gap={8}>
            {TYPE_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} selected={type === o.value} onPress={() => setType(o.value)} />
            ))}
          </Row>
        </View>
        {type === 'COUNT' ? (
          <View>
            <Txt role="footnote" tone="secondary" style={{ marginBottom: 6 }}>
              Times a day
            </Txt>
            <Stepper value={target} onChange={setTarget} min={1} max={50} label="times a day" />
          </View>
        ) : null}
        <View>
          <Txt role="footnote" tone="secondary" style={{ marginBottom: 6 }}>
            Category
          </Txt>
          <View style={styles.wrap}>
            {(['hydration', 'movement', 'fuel', 'mind', 'body'] as Category[]).map((k) => (
              <Chip key={k} label={CATEGORY_LABELS[k]} color={c.cat[k]} selected={category === k} onPress={() => setCategory(k)} />
            ))}
          </View>
        </View>
        <View>
          <Txt role="footnote" tone="secondary" style={{ marginBottom: 6 }}>
            Icon
          </Txt>
          <View style={styles.wrap}>
            {ICON_OPTIONS.map((k) => (
              <PressableScale key={k} onPress={() => setIcon(k)} accessibilityRole="button" accessibilityLabel={`Icon ${k}`} accessibilityState={{ selected: icon === k }} style={[styles.iconChoice, { borderColor: icon === k ? c.green : 'transparent' }]}>
                <IconTile icon={k} color={c.cat[category]} size={40} />
              </PressableScale>
            ))}
          </View>
        </View>
        <PillButton label="Create habit" onPress={create} disabled={name.trim().length === 0} Leading={UI.Plus} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  groupHeader: {
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 64,
  },
  presetMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  added: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconChoice: {
    borderRadius: 14,
    borderWidth: 2,
    padding: 1,
  },
});
