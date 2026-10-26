import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AmountSheet } from '@/components/tracker/AmountSheet';
import { EvidenceBlock, EvidencePill } from '@/components/tracker/EvidenceBlock';
import { HabitEditorSheet } from '@/components/tracker/HabitEditorSheet';
import { HabitRow } from '@/components/tracker/HabitRow';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Dot, IconButton, IconTile, PillButton, Row, SectionHeader } from '@/components/ui/primitives';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { SampleDataChip } from '@/components/tracker/SampleDataChip';
import { useColors } from '@/hooks/useColors';
import type { Category, Habit } from '@/src/domain/models';
import { CATEGORY_LABELS, CATEGORY_ORDER, PRESET_BY_ID, PRESETS, type Preset } from '@/src/library/presets';
import { useHabitViews } from '@/src/state/hooks';
import { useTracker } from '@/src/state/TrackerProvider';

export default function HabitsScreen() {
  const c = useColors();
  const router = useRouter();
  const { state, actions } = useTracker();
  const views = useHabitViews();
  // "/habits?preset=water" opens that preset's Library sheet straight away: the door from a Today
  // card whose habit is gone lands on the thing to add back, not on the top of a long list.
  // `t` is the instant of the knock: the same door tapped twice opens the sheet twice.
  const { preset: presetParam, t: knock } = useLocalSearchParams<{ preset?: string; t?: string }>();
  const door = presetParam ? `${presetParam}|${knock ?? ''}` : undefined;
  const [preset, setPreset] = useState<Preset | null>(() => PRESET_BY_ID[presetParam ?? ''] ?? null);
  const [openedFor, setOpenedFor] = useState(door);
  if (door !== openedFor) {
    setOpenedFor(door);
    setPreset(PRESET_BY_ID[presetParam ?? ''] ?? null);
  }
  const [amountHabit, setAmountHabit] = useState<Habit | null>(null);
  const needsAmount = (h: Habit) => h.type === 'AMOUNT' || (h.type === 'TIMER' && !h.mindKind);
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
  const archived = state.habits.filter((h) => h.archived);
  const libraryGroups = CATEGORY_ORDER.map((k) => ({ key: k, items: PRESETS.filter((p) => p.category === k) })).filter((g) => g.items.length > 0);

  const openHabit = (id: string) => router.push({ pathname: '/habit/[id]', params: { id } });

  return (
    <Screen>
      <ScreenHeader title="Habits" right={<IconButton Glyph={UI.Plus} label="New custom habit" onPress={() => setCustomOpen(true)} size={40} filled />} />
      <SampleDataChip />

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
                units={state.settings.units}
                onPress={() => openHabit(v.habit.id)}
                onIncrement={() => (needsAmount(v.habit) ? setAmountHabit(v.habit) : actions.increment(v.habit))}
                onToggle={() => actions.toggleYesNo(v.habit)}
                onTimer={() => (needsAmount(v.habit) ? setAmountHabit(v.habit) : router.push({ pathname: '/mind', params: { kind: v.habit.mindKind ?? 'MEDITATION' } }))}
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

      {archived.length > 0 ? (
        <>
          <SectionHeader title="Archived" />
          <Txt role="footnote" tone="secondary" style={{ marginTop: -4, marginBottom: 4, paddingHorizontal: 4 }}>
            History is kept. Restore brings a habit back with its streaks and chart.
          </Txt>
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {archived.map((h, i) => (
              <View key={h.id} style={[styles.presetRow, i < archived.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline } : null]}>
                <PressableScale haptic={false} scaleTo={0.985} onPress={() => openHabit(h.id)} accessibilityRole="button" accessibilityLabel={`${h.name}, archived. Open`} style={styles.presetMain}>
                  <IconTile icon={h.icon} color={c.textTertiary} size={40} />
                  <View style={{ flex: 1 }}>
                    <Txt role="title2" numberOfLines={1} tone="secondary">
                      {h.name}
                    </Txt>
                    <Txt role="footnote" tone="tertiary" numberOfLines={1}>
                      {CATEGORY_LABELS[h.category]}
                    </Txt>
                  </View>
                </PressableScale>
                <PillButton label="Restore" compact kind="ghost" onPress={() => actions.updateHabit(h.id, { archived: false })} accessibilityLabel={`Restore ${h.name}`} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

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

      <HabitEditorSheet visible={customOpen} onClose={() => setCustomOpen(false)} onCreated={(h) => openHabit(h.id)} />
      {amountHabit ? <AmountSheet visible onClose={() => setAmountHabit(null)} habit={amountHabit} /> : null}
    </Screen>
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
});
