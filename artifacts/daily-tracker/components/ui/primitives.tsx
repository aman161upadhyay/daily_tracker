/**
 * Small shared controls: IconTile, SectionHeader, Chip, Stepper, Pill button,
 * RangeSegment, Divider, Row. Each is < 60 lines; they live together to keep
 * the import surface small.
 */
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import type { CategoryKey } from '@/constants/colors';
import { TYPE } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { withAlpha } from '@/src/domain/color/oklch';
import type { HabitIcon } from '@/src/domain/models';
import { HabitGlyph, UI, type Icon } from './icons';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';
import { parseDecimalInput } from '@/src/domain/time/format';

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
        <PressableScale haptic={false} onPress={onAction} accessibilityRole="button" accessibilityLabel={action} hitSlop={8} style={styles.sectionAction}>
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
    <PressableScale onPress={onPress} accessibilityRole="button" aria-selected={selected} accessibilityLabel={accessibilityLabel ?? label} hitSlop={6}>
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
      hitSlop={compact ? 4 : 0}
      style={[styles.pill, compact ? styles.pillCompact : null, { backgroundColor: bg, borderColor: kind === 'ghost' ? c.hairline : 'transparent' }, style]}
    >
      {Leading ? <Leading size={18} color={fg} weight="bold" /> : null}
      <Txt role={compact ? 'callout' : 'title2'} color={fg} numberOfLines={1}>
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
  disabled,
}: {
  Glyph: Icon;
  onPress: () => void;
  label: string;
  size?: number;
  color?: string;
  filled?: boolean;
  haptic?: boolean;
  disabled?: boolean;
}) {
  const c = useColors();
  const accent = color ?? c.green;
  return (
    <PressableScale
      onPress={onPress}
      haptic={haptic}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled ? true : undefined}
      // Touch target of at least 48 dp whatever the drawn size (Material / WCAG 2.5.8).
      hitSlop={Math.max(6, Math.ceil((48 - size) / 2))}
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
      {/* A disabled button keeps its place and fades: the bound is visible, not a dead tap. */}
      <Glyph size={Math.round(size * 0.48)} color={filled ? c.onGreen : accent} weight="bold" style={disabled ? { opacity: 0.35 } : undefined} />
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
  parse,
  keyboardType,
  placeholder,
  label,
  inputKind = parse ? 'time' : 'number',
}: {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  /** Reads a typed value (a clock time, say); plain numbers when absent. Returning null keeps the old value. */
  parse?: (text: string) => number | null;
  /** Keyboard while typing: the number pad for plain numbers, the full keyboard when `parse` reads text. */
  keyboardType?: 'number-pad' | 'decimal-pad' | 'default';
  placeholder?: string;
  label: string;
  /** What a typed value is, for the hint read out on the value ("Tap to type a time"); inferred from `parse` when absent. */
  inputKind?: 'number' | 'time' | 'amount';
}) {
  const c = useColors();
  // A value off the step grid (100 ml typed in the editor, a restored 1,750) moves to the next
  // grid point rather than staying off it forever: 100 → 250 → 500, not 100 → 350 → 600.
  const up = Math.min(max, Math.max(min, value % step === 0 ? value + step : Math.ceil(value / step) * step));
  const down = Math.max(min, Math.min(max, value % step === 0 ? value - step : Math.floor(value / step) * step));
  // Tapping the number types it: 2,000 → 1,850 ml is one entry, not six presses. Typed values keep
  // to the bounds but not to the step grid (the next press snaps back onto it). Every keystroke
  // that reads as a value is applied at once: a sheet's Save button does not blur the field
  // (taps are kept for the keyboard), so waiting for the blur would lose what was typed.
  const [typed, setTyped] = useState<string | null>(null);
  // What the field opened with. Text equal to it means the value it was formatted from, not a
  // re-reading of the text: 2,000 ml shown as "67.6" oz must not come back as 1,999 ml because
  // the person tapped the field and pressed Done.
  const opened = useRef({ text: '', value });
  const apply = (text: string) => {
    if (text === opened.current.text) {
      // Restored to the opening value — inside the bounds as they stand now (a sibling field may
      // have moved them while this one was open: an end time typed before its start).
      const restored = Math.min(max, Math.max(min, opened.current.value));
      if (value !== restored) onChange(restored);
      return;
    }
    if (text.trim() === '') return;
    const n = parse ? parse(text) : parseDecimalInput(text);
    if (n === null || !Number.isFinite(n)) return;
    const next = Math.min(max, Math.max(min, Math.round(n)));
    if (next !== value) onChange(next);
  };
  const edit = (text: string) => {
    setTyped(text);
    apply(text);
  };
  const commit = () => {
    if (typed === null) return;
    setTyped(null);
    apply(typed);
  };
  const open = (text: string) => {
    opened.current = { text, value };
    setTyped(text);
  };
  const shown = format ? format(value) : String(value);
  const bounds = parse ? `, ${format ? format(min) : min} to ${format ? format(max) : max}` : Number.isFinite(max) ? `, ${min} to ${max}` : `, at least ${min}`;
  return (
    <View style={styles.stepper} accessibilityLabel={label}>
      {/* At a bound the button is disabled rather than a tap that changes nothing (the bound shows). */}
      <IconButton Glyph={UI.Minus} label={`Decrease ${label}`} onPress={() => onChange(down)} size={40} color={c.text} disabled={down === value} />
      {typed !== null ? (
        <TextInput
          value={typed}
          onChangeText={edit}
          onBlur={commit}
          onSubmitEditing={commit}
          autoFocus
          selectTextOnFocus
          keyboardType={keyboardType ?? (parse ? 'default' : 'number-pad')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          maxLength={parse ? 10 : 6}
          placeholder={placeholder ?? (parse ? '9:30 pm' : undefined)}
          placeholderTextColor={c.textTertiary}
          accessibilityLabel={`${label}${bounds}`}
          style={[TYPE.title2, styles.stepperValue, styles.stepperInput, { color: c.text, borderColor: c.tint }]}
        />
      ) : (
        <Pressable onPress={() => open(parse ? shown : String(value))} accessibilityRole="button" accessibilityLabel={`${label}: ${shown}. Tap to type ${inputKind === 'time' ? 'a time' : inputKind === 'amount' ? 'an amount' : 'a number'}${bounds}`} hitSlop={6}>
          <Txt role="title2" style={styles.stepperValue} align="center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {shown}
          </Txt>
        </Pressable>
      )}
      <IconButton Glyph={UI.Plus} label={`Increase ${label}`} onPress={() => onChange(up)} size={40} color={c.text} disabled={up === value} />
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
            aria-selected={selected}
            accessibilityLabel={o.label}
            hitSlop={{ top: 8, bottom: 8 }}
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
    // The 40 dp buttons get a 48 dp row, so their hit slop never overlaps the row above or below.
    minHeight: 48,
  },
  stepperValue: {
    minWidth: 84,
    // Long values ("1,750 ml", "12:30 pm") shrink before they push the + button off the card.
    flexShrink: 1,
  },
  stepperInput: {
    textAlign: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 2,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    minHeight: 40, // + 8 dp hitSlop above and below = 56 dp, segments sit side by side so no horizontal slop
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
