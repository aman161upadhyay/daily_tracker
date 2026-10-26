import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { withAlpha } from '@/src/domain/color/oklch';
import type { EvidenceGrade } from '@/src/domain/models';
import { EVIDENCE_HELP, presetWhy, type Preset } from '@/src/library/presets';
import { useTracker } from '@/src/state/TrackerProvider';
import { UI } from '../ui/icons';
import { PressableScale } from '../ui/PressableScale';
import { Txt } from '../ui/Txt';

export function EvidencePill({ grade }: { grade: EvidenceGrade }) {
  const c = useColors();
  const color = grade === 'Strong' ? c.green : grade === 'Moderate' ? c.greenMist : grade === 'Emerging' ? c.goldBright : c.textSecondary;
  return (
    <View style={[styles.pill, { backgroundColor: withAlpha(color, 0.16) }]} accessibilityLabel={`Evidence: ${grade}. ${EVIDENCE_HELP[grade]}`}>
      <Txt role="caption" color={color}>
        {grade}
      </Txt>
    </View>
  );
}

/** "Why this matters": one honest sentence, the caveat, and tappable sources (the only network use). */
export function EvidenceBlock({ preset }: { preset: Preset }) {
  const c = useColors();
  const { state } = useTracker();
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.gradeRow}>
        <EvidencePill grade={preset.evidence} />
        <Txt role="footnote" tone="tertiary">
          {EVIDENCE_HELP[preset.evidence]}
        </Txt>
      </View>
      <Txt role="body">{presetWhy(preset, state.settings.units)}</Txt>
      {preset.caveat ? (
        <View style={[styles.caveat, { borderLeftColor: c.gold }]}>
          <Txt role="footnote" tone="secondary">
            {preset.caveat}
          </Txt>
        </View>
      ) : null}
      {preset.sources.length > 0 ? (
        <View style={{ gap: 4, marginTop: 2 }}>
          {preset.sources.map((src) => (
            <PressableScale
              key={src.url}
              haptic={false}
              onPress={() => Linking.openURL(src.url).catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel={`Source: ${src.label}`}
              style={styles.source}
            >
              <UI.External size={14} color={c.greenBright} weight="bold" />
              <Txt role="footnote" tone="green" style={{ flex: 1 }}>
                {src.label}
              </Txt>
            </PressableScale>
          ))}
        </View>
      ) : (
        <Txt role="footnote" tone="tertiary">
          Expert guidance; no single trial to cite.
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 999,
    justifyContent: 'center',
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  caveat: {
    borderLeftWidth: 2,
    paddingLeft: 10,
  },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
  },
});
