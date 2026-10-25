/**
 * Small shared controls: IconTile, SectionHeader, Chip, Stepper, Pill button,
 * RangeSegment, Divider, Row. Each is < 60 lines; they live together to keep
 * the import surface small.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { CategoryKey } from '@/constants/colors';
import { useColors } from '@/hooks/useColors';
import { withAlpha } from '@/src/domain/color/oklch';
import type { HabitIcon } from '@/src/domain/models';
import { HabitGlyph, UI, type Icon } from './icons';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

// ── IconTile ───────────────────────────────────────────────────────────────

export function IconTile({
  icon,
  Glyph,
  color,
  size = 40,
  tint = true,
}: {
  icon?: HabitIcon;
  Glyph?: Icon;
  color: string;
  size?: number;
  /** Tinted background (default) or solid fill. */
  tint?: boolean;
}) {
  const c = useColors();
  const glyphSize = Math.round(size * 0.55);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        backgroundColor: tint ? withAlpha(color, 0.16) : color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {Glyph ? (
        <Glyph size={glyphSize} color={tint ? color : c.onGreen} weight="duotone" duotoneColor={color} duotoneOpacity={0.35} />
      ) : icon ? (
        <HabitGlyph icon={icon} size={glyphSize} color={tint ? color : c.onGreen} weight="duotone" duotoneColor={color} duotoneOpacity={0.35} />
      ) : null}
    </View>
  );
}

export function useCategoryColor(): (key: CategoryKey) => string {
  const c = useColors();
  return (key) => c.cat[key];
}

// ── SectionHeader ──────────────────────────────────────────────────────────

export function SectionHeader({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Txt role="title1">{title}</Txt>
      {action && onAction ? (
        <PressableScale haptic={false} onPress={onAction} accessibilityRole="button" accessibilityLabel={action} style={styles.sectionAction}>
          <Txt role="callout" tone="green">
            {action}
          </Txt>
        </PressableScale>
      ) : null}
    </View>
  );
}

// ── Chip ───────────────────────────────────────────────────────────────────

export function Chip({
  label,
  selected,
  onPress,
  color,
  Leading,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  Leading?: Icon;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const accent = color ?? c.green;
  const content = (
    <View
      style={[
        styles.chip,
        { backgroundColor: selected ? accent : c.surfaceRaised, borderColor: selected ? accent : c.hairline },
      ]}
    >
      {Leading ? <Leading size={16} color={selected ? c.onGreen : accent} weight="bold" /> : null}
      <Txt role="callout" color={selected ? c.onGreen : c.text}>
        {label}
      </Txt>
    </View>
  );
  if (!onPress) return content;
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={accessibilityLabel ?? label}>
      {content}
    </PressableScale>
  );
}

// ── Pill button ────────────────────────────────────────────────────────────

export function PillButton({
  label,
  onPress,
  kind = 'primary',
  Leading,
  color,
  compact,
  accessibilityLabel,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  Leading?: Icon;
  color?: string;
  compact?: boolean;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const accent = color ?? c.green;
  const bg = kind === 'primary' ? accent : kind === 'danger' ? withAlpha(c.danger, 0.14) : c.surfaceRaised;
  const fg = kind === 'primary' ? c.onGreen : kind === 'danger' ? c.danger : c.text;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.pill, compact ? styles.pillCompact : null, { backgroundColor: bg, borderColor: kind === 'ghost' ? c.hairline : 'transparent' }, style]}
    >
      {Leading ? <Leading size={18} color={fg} weight="bold" /> : null}
      <Txt role={compact ? 'callout' : 'title2'} color={fg}>
        {label}
      </Txt>
    </PressableScale>
  );
}

// ── Round icon button ──────────────────────────────────────────────────────

export function IconButton({
  Glyph,
  onPress,
  label,
  size = 44,
  color,
  filled,
  haptic,
}: {
  Glyph: Icon;
  onPress: () => void;
  label: string;
  size?: number;
  color?: string;
  filled?: boolean;
  haptic?: boolean;
}) {
  const c = useColors();
  const accent = color ?? c.green;
  return (
    <PressableScale
      onPress={onPress}
      haptic={haptic}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: filled ? accent : c.surfaceRaised,
        borderWidth: filled ? 0 : 1,
        borderColor: c.hairline,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Glyph size={Math.round(size * 0.48)} color={filled ? c.onGreen : accent} weight="bold" />
    </PressableScale>
  );
}

// ── Stepper ────────────────────────────────────────────────────────────────

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  format,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  label: string;
}) {
  const c = useColors();
  return (
    <View style={styles.stepper} accessibilityLabel={label}>
      <IconButton Glyph={UI.Minus} label={`Decrease ${label}`} onPress={() => onChange(Math.max(min, value - step))} size={40} color={c.text} />
      <Txt role="title2" style={styles.stepperValue} align="center">
        {format ? format(value) : String(value)}
      </Txt>
      <IconButton Glyph={UI.Plus} label={`Increase ${label}`} onPress={() => onChange(Math.min(max, value + step))} size={40} color={c.text} />
    </View>
  );
}

// ── RangeSegment ───────────────────────────────────────────────────────────

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={[styles.segment, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <PressableScale
            key={o.value}
            haptic={false}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            style={[styles.segmentItem, selected ? { backgroundColor: c.surfaceRaised, borderColor: c.hairline } : null]}
          >
            <Txt role="callout" tone={selected ? 'primary' : 'secondary'}>
              {o.label}
            </Txt>
          </PressableScale>
        );
      })}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.hairline, marginLeft: inset }} />;
}

export function Row({ children, style, gap = 12 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionAction: {
    minHeight: 32,
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillCompact: {
    minHeight: 40,
    paddingHorizontal: 14,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperValue: {
    minWidth: 84,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
