import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { HabitIcon } from '@/src/domain/models';
import { Card } from '../ui/Card';
import { UI, type Icon } from '../ui/icons';
import { IconTile, Row } from '../ui/primitives';
import { PressableScale } from '../ui/PressableScale';
import { Txt } from '../ui/Txt';
import { MiniChart, type MiniChartProps } from './MiniChart';

export interface SummaryCardProps {
  title: string;
  color: string;
  icon?: HabitIcon;
  Glyph?: Icon;
  value: string;
  unit?: string;
  /** Short line under the value ("of 2,000 ml · behind pace"). */
  detail?: string;
  timestamp?: string;
  chart?: Omit<MiniChartProps, 'color'>;
  onPress?: () => void;
  /** Optional action row rendered under the chart (e.g. the +250 ml button). */
  footer?: React.ReactNode;
  featured?: boolean;
}

/**
 * Apple-Health metric card: icon + title + chevron, big value, timestamp, mini
 * chart. Only the metric area is pressable; footer actions sit beside it, so
 * buttons are never nested inside buttons.
 */
export function SummaryCard({ title, color, icon, Glyph, value, unit, detail, timestamp, chart, onPress, footer, featured }: SummaryCardProps) {
  const c = useColors();
  const metric = (
    <>
      <Row style={styles.header} gap={8}>
        <IconTile icon={icon} Glyph={Glyph} color={color} size={24} />
        <Txt role="title2" color={color} style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </Txt>
        {onPress ? <UI.Caret size={16} color={c.textTertiary} weight="bold" /> : null}
      </Row>
      <View style={styles.valueRow}>
        <Txt role="display">{value}</Txt>
        {unit ? (
          <Txt role="callout" tone="secondary" style={styles.unit}>
            {unit}
          </Txt>
        ) : null}
        <View style={{ flex: 1 }} />
        {timestamp ? (
          <Txt role="footnote" tone="secondary">
            {timestamp}
          </Txt>
        ) : null}
      </View>
      {detail ? (
        <Txt role="footnote" tone="secondary" style={{ marginTop: 2 }}>
          {detail}
        </Txt>
      ) : null}
      {chart ? (
        <View style={{ marginTop: 12 }}>
          <MiniChart {...chart} color={color} />
        </View>
      ) : null}
    </>
  );

  return (
    <Card featured={featured}>
      {onPress ? (
        <PressableScale
          haptic={false}
          scaleTo={0.99}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={[`${title}: ${value}${unit ? ` ${unit}` : ''}`, timestamp, detail].filter(Boolean).join(', ')}
          accessibilityHint={`Opens ${title}`}
        >
          {metric}
        </PressableScale>
      ) : (
        metric
      )}
      {footer ? <View style={{ marginTop: 12 }}>{footer}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 10,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  unit: {
    marginBottom: 2,
  },
});
