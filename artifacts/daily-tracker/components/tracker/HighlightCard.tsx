import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { Highlight } from '@/src/state/selectors';
import { Card } from '../ui/Card';
import { UI } from '../ui/icons';
import { Dot, Row } from '../ui/primitives';
import { PressableScale } from '../ui/PressableScale';
import { Txt } from '../ui/Txt';
import { MiniChart } from './MiniChart';

/** Apple-Health "Highlights" insight card: title, one-line body, sparkline. */
export function HighlightCard({ highlight, onPress }: { highlight: Highlight; onPress?: () => void }) {
  const c = useColors();
  const color = c.cat[highlight.category];
  const body = (
    <Card>
      <Row gap={8} style={{ marginBottom: 6 }}>
        <Dot color={color} />
        <Txt role="footnote" color={color} style={{ flex: 1 }}>
          Highlight
        </Txt>
        {onPress ? <UI.Caret size={14} color={c.textTertiary} weight="bold" /> : null}
      </Row>
      <View style={styles.content}>
        <View style={{ flex: 1 }}>
          <Txt role="title2">{highlight.title}</Txt>
          <Txt role="footnote" tone="secondary" style={{ marginTop: 4 }}>
            {highlight.body}
          </Txt>
        </View>
        {highlight.series ? (
          <View style={styles.chart}>
            <MiniChart values={highlight.series} color={color} height={44} />
          </View>
        ) : null}
      </View>
    </Card>
  );
  if (!onPress) return body;
  return (
    <PressableScale haptic={false} scaleTo={0.985} onPress={onPress} accessibilityRole="button" accessibilityLabel={highlight.title}>
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  chart: {
    width: 96,
  },
});
