/**
 * The home-screen widget, drawn with react-native-android-widget primitives
 * (they become Android RemoteViews, not React Native views). Only ever
 * imported lazily from `src/services/widget.native.ts`, so Expo Go and web
 * never evaluate it.
 */
import React from 'react';
import { PixelRatio } from 'react-native';
import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import type { HexColor } from 'react-native-android-widget';
import colors from '@/constants/colors';
import { TILE_GAP, ringValue, widgetLayout, type WidgetLayout } from './layout';
import { widgetDayLabel, type WidgetModel, type WidgetTile } from './model';
import { ringSvg } from './ring';

/** Tap on a ring: log the habit's natural unit (handled in the headless task). */
export const CLICK_LOG = 'LOG';
/** Tap on a label: open that habit in the app (deep link, handled by the OS). */
export const HABIT_URI = (habitId: string) => `daily-tracker://habit/${habitId}`;

const FONT_BOLD = 'Manrope-ExtraBold';
const FONT_SEMI = 'Manrope-SemiBold';

const hex = (s: string) => s as HexColor;
const C = colors.dark;

export interface TrackerWidgetProps {
  model: WidgetModel;
  width: number;
  height: number;
  /** The system font scale; read from the device when not given (tests pass one). */
  fontScale?: number;
}

/** What TalkBack reads for the ring: the progress, then what a tap does. */
export function ringLabel(tile: WidgetTile): string {
  const progress = `${tile.name}: ${tile.value} ${tile.caption}`.trim();
  const action = tile.kind === 'water' ? 'Double-tap to log a glass.' : tile.kind === 'rotation' ? 'Double-tap to log the next snack.' : tile.done ? 'Double-tap to log again.' : 'Double-tap to log it.';
  return `${progress}. ${action}`;
}

function Ring({ tile, layout }: { tile: WidgetTile; layout: WidgetLayout }) {
  const size = layout.ring;
  const stroke = Math.max(4, Math.round(size * 0.11));
  const inner = size - 2 * stroke - 6;
  const value = ringValue(tile.value, inner, layout.valueSize);
  return (
    <OverlapWidget
      style={{ width: size, height: size }}
      clickAction={CLICK_LOG}
      clickActionData={{ habitId: tile.habitId, kind: tile.kind }}
      accessibilityLabel={ringLabel(tile)}
    >
      <SvgWidget svg={ringSvg({ size, ratio: tile.ratio, color: tile.color })} style={{ width: size, height: size }} />
      <FlexWidget style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {/* The ring is dp, so its value is too: a font-scaled "750 ml" would spill out of a 48 dp ring. TalkBack reads the full value from the label. */}
        <TextWidget
          text={value.text}
          maxLines={1}
          truncate="END"
          allowFontScaling={false}
          style={{
            width: inner,
            fontSize: value.size,
            fontFamily: FONT_BOLD,
            color: hex(tile.done ? tile.color : C.text),
            textAlign: 'center',
          }}
        />
      </FlexWidget>
    </OverlapWidget>
  );
}

function Labels({ tile, layout, align }: { tile: WidgetTile; layout: WidgetLayout; align: 'center' | 'left' }) {
  return (
    <FlexWidget
      style={{
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        justifyContent: 'center',
        width: 'match_parent',
        // A tap target of its own (opens the habit), so never shorter than Android's 48 dp.
        height: layout.mode === 'stacked' ? layout.labelBlock : 'match_parent',
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: HABIT_URI(tile.habitId) }}
      accessibilityLabel={`${tile.name}, ${tile.value} ${tile.caption}. Opens the habit.`}
    >
      <TextWidget
        text={tile.name}
        maxLines={1}
        truncate="END"
        style={{ fontSize: layout.nameSize, fontFamily: FONT_SEMI, color: hex(C.text), textAlign: align }}
      />
      <TextWidget
        text={tile.caption}
        maxLines={1}
        truncate="END"
        style={{ fontSize: layout.captionSize, fontFamily: FONT_SEMI, color: hex(C.textSecondary), textAlign: align, marginTop: 1 }}
      />
    </FlexWidget>
  );
}

function Tile({ tile, layout }: { tile: WidgetTile; layout: WidgetLayout }) {
  if (layout.mode === 'inline') {
    return (
      <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: 'match_parent' }}>
        <Ring tile={tile} layout={layout} />
        <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 8, height: 'match_parent' }}>
          <Labels tile={tile} layout={layout} align="left" />
        </FlexWidget>
      </FlexWidget>
    );
  }
  return (
    <FlexWidget style={{ flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'match_parent' }}>
      <Ring tile={tile} layout={layout} />
      <Labels tile={tile} layout={layout} align="center" />
    </FlexWidget>
  );
}

function Frame({ children, width, height, padding }: { children: React.ReactNode; width: number; height: number; padding: number }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding,
        backgroundColor: hex(C.surface),
        borderRadius: Math.min(24, Math.round(Math.min(width, height) * 0.18)),
        borderWidth: 1,
        borderColor: 'rgba(201, 168, 76, 0.45)',
        flexGap: TILE_GAP,
      }}
    >
      {children}
    </FlexWidget>
  );
}

function Message({ text, width, height, padding }: { text: string; width: number; height: number; padding: number }) {
  return (
    <Frame width={width} height={height} padding={padding}>
      <TextWidget text={text} maxLines={3} style={{ fontSize: 12, fontFamily: FONT_SEMI, color: hex(C.textSecondary), textAlign: 'center' }} />
    </Frame>
  );
}

export function TrackerWidget({ model, width, height, fontScale }: TrackerWidgetProps) {
  const scale = fontScale ?? PixelRatio.getFontScale();
  const layout = widgetLayout(width, height, model.tiles.length, scale);
  if (layout.shown === 0) {
    return <Message text={model.notice ?? 'Open Daily Tracker to choose habits for this widget'} width={width} height={height} padding={layout.padding} />;
  }
  // A one-row widget has no line to spare: a notice replaces the tiles until the next redraw.
  if (model.notice && !layout.showDay) return <Message text={model.notice} width={width} height={height} padding={layout.padding} />;
  const dayLabel = widgetDayLabel(model.day);
  const tiles = model.tiles.slice(0, layout.shown).map((tile) => <Tile key={tile.habitId} tile={tile} layout={layout} />);
  if (!layout.showDay) {
    return (
      <Frame width={width} height={height} padding={layout.padding}>
        {tiles}
      </Frame>
    );
  }
  // The day (and any notice) sit in a thin line above the tiles; the tiles keep their tap sizes.
  const line = model.notice ? `${dayLabel} · ${model.notice}` : dayLabel;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'column',
        padding: layout.padding,
        backgroundColor: hex(C.surface),
        borderRadius: Math.min(24, Math.round(Math.min(width, height) * 0.18)),
        borderWidth: 1,
        borderColor: 'rgba(201, 168, 76, 0.45)',
      }}
    >
      <TextWidget
        text={line}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 10, fontFamily: FONT_SEMI, color: hex(model.notice ? C.gold : C.textTertiary), textAlign: 'left', width: 'match_parent', marginBottom: 2 }}
      />
      <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGap: TILE_GAP }}>{tiles}</FlexWidget>
    </FlexWidget>
  );
}
