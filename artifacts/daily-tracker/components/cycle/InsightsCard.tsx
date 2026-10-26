import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { UI } from '@/components/ui/icons';
import { Divider, IconTile, Row } from '@/components/ui/primitives';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { describeCorrelation, describeWindow, MIN_CORRELATION_CYCLES, MIN_PATTERN_CYCLES } from '@/src/domain/cycle/insights';
import { symptomLabel } from '@/src/domain/cycle/symptoms';
import type { CycleInsights } from '@/src/state/selectors';

/** Symptom windows and habit tendencies, or what it takes to get them. */
export function InsightsCard({ insights }: { insights: CycleInsights }) {
  const c = useColors();
  const { patterns, correlations, loggedCycles } = insights;
  const empty = patterns.length === 0 && correlations.length === 0;

  return (
    <Card>
      <Row gap={12} style={{ marginBottom: empty ? 8 : 12 }}>
        <IconTile Glyph={UI.Sparkle} color={c.gold} size={36} />
        <View style={{ flex: 1 }}>
          <Txt role="title2" heading>Insights</Txt>
          <Txt role="footnote" tone="secondary">
            {loggedCycles === 0 ? 'From the symptoms you log in the day sheet.' : `From ${loggedCycles} logged ${loggedCycles === 1 ? 'cycle' : 'cycles'}.`}
          </Txt>
        </View>
      </Row>

      {empty ? (
        <Txt role="footnote" tone="tertiary">
          {loggedCycles < MIN_PATTERN_CYCLES
            ? `Patterns appear once symptoms are logged in ${MIN_PATTERN_CYCLES} cycles; habit tendencies after ${MIN_CORRELATION_CYCLES}.`
            : 'Nothing recurring yet. Keep logging the days that stand out.'}
        </Txt>
      ) : null}

      {patterns.map((p, i) => (
        <View key={p.key}>
          {i > 0 ? <Divider /> : null}
          <View style={styles.row}>
            <Txt role="body">{`${symptomLabel(p.key)} tends to show up ${describeWindow(p)}.`}</Txt>
            <Txt role="footnote" tone="tertiary">{`In ${Math.round(p.share * p.cycles)} of ${p.cycles} cycles`}</Txt>
          </View>
        </View>
      ))}

      {correlations.length > 0 ? (
        <>
          {patterns.length > 0 ? <Divider /> : null}
          <Txt role="footnote" tone="secondary" style={{ marginTop: patterns.length > 0 ? 12 : 0, marginBottom: 4 }}>
            Habits and how cycles felt
          </Txt>
          {correlations.map((x, i) => (
            <View key={`${x.habitId}-${x.key}`}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.row}>
                <Txt role="body">{describeCorrelation(x, symptomLabel)}</Txt>
                <Txt role="footnote" tone="tertiary">{`${x.n} cycles · a tendency, not a cause`}</Txt>
              </View>
            </View>
          ))}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 10,
    gap: 2,
  },
});
