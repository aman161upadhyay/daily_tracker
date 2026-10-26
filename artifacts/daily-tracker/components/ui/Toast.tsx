import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { PressableScale } from '@/components/ui/PressableScale';
import { Txt } from '@/components/ui/Txt';
import { useColors } from '@/hooks/useColors';
import { FONTS } from '@/constants/typography';

/**
 * A short message at the bottom of the screen with one optional action ("Removed 250 ml · Undo").
 * One at a time; a new toast replaces the one showing. It goes away on its own — the action is a
 * convenience, never the only way back (a removed record can be logged again by hand), so the
 * default is six seconds, doubled while a screen reader is on.
 */
export interface ToastSpec {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Milliseconds before it goes away (default 6000; ×2 with a screen reader on). */
  durationMs?: number;
}

interface Shown extends ToastSpec {
  seq: number;
}

export const TOAST_DEFAULT_MS = 6000;

let shown: Shown | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function showToast(spec: ToastSpec): void {
  seq += 1;
  shown = { ...spec, seq };
  emit();
}

/** Hide the toast if `seq` is still the one showing (or any toast when `seq` is omitted). */
export function hideToast(which?: number): void {
  if (!shown) return;
  if (which !== undefined && shown.seq !== which) return;
  shown = null;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getShown() {
  return shown;
}

/** Height of the bottom tab bar the toast must clear while a tab screen is showing. */
const TAB_BAR_HEIGHT = Platform.OS === 'web' ? 64 : 49;

/**
 * Mounts once in the root layout, above the stack and under the app-lock gate (a Modal), so a
 * toast never shows above the lock. `replaceEpoch` from the provider hides whatever is showing
 * when the whole state was replaced — an Undo from before an erase or a restore would put a record
 * into a state it never belonged to.
 */
export function ToastHost({ replaceEpoch }: { replaceEpoch: number }) {
  const current = useSyncExternalStore(subscribe, getShown, getShown);
  const c = useColors();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const reduceMotion = useReducedMotion();
  const [screenReader, setScreenReader] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const lastEpoch = useRef(replaceEpoch);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled().then((on) => alive && setScreenReader(on)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (on) => alive && setScreenReader(on));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (lastEpoch.current !== replaceEpoch) {
      lastEpoch.current = replaceEpoch;
      hideToast();
    }
  }, [replaceEpoch]);

  // The host leaves with its provider (an error boundary falling back and starting over): a toast
  // whose Undo would dispatch into that retired provider must not be waiting for the next one.
  useEffect(() => () => hideToast(), []);

  // Fade in, announce, time out. A new toast restarts the clock; the timer is keyed on its seq.
  useEffect(() => {
    if (!current) {
      opacity.setValue(0);
      return;
    }
    if (reduceMotion) opacity.setValue(1);
    else {
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }).start();
    }
    AccessibilityInfo.announceForAccessibility(current.actionLabel ? `${current.message}. ${current.actionLabel} available.` : current.message);
    const ms = (current.durationMs ?? TOAST_DEFAULT_MS) * (screenReader ? 2 : 1);
    const mine = current.seq;
    const t = setTimeout(() => hideToast(mine), ms);
    return () => clearTimeout(t);
  }, [current, opacity, reduceMotion, screenReader]);

  if (!current) return null;
  const inTabs = segments[0] === '(tabs)';
  const bottom = insets.bottom + (inTabs ? TAB_BAR_HEIGHT : 0) + 12;
  const act = () => {
    const spec = current;
    hideToast(spec.seq);
    spec.onAction?.();
  };
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: bottom, paddingHorizontal: 16 }]}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={{
          opacity,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          maxWidth: 480,
          width: '100%',
          minHeight: 52,
          borderRadius: 16,
          paddingLeft: 16,
          paddingRight: current.actionLabel ? 6 : 16,
          paddingVertical: 6,
          backgroundColor: c.surfaceRaised,
          borderWidth: 1,
          borderColor: c.hairline,
          ...(Platform.OS === 'android' ? { elevation: 6 } : {}),
          ...(Platform.OS === 'ios' || Platform.OS === 'web' ? { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } } : {}),
        }}
      >
        <PressableScale accessibilityRole="button" accessibilityLabel={`${current.message}. Dismiss`} haptic={false} onPress={() => hideToast(current.seq)} style={{ flex: 1, minHeight: 40, justifyContent: 'center' }}>
          <Txt role="callout" numberOfLines={2}>
            {current.message}
          </Txt>
        </PressableScale>
        {current.actionLabel ? (
          <PressableScale accessibilityRole="button" accessibilityLabel={current.actionLabel} onPress={act} hitSlop={{ top: 8, bottom: 8, right: 8 }} style={{ minHeight: 40, minWidth: 48, paddingHorizontal: 12, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}>
            <Txt role="callout" color={c.greenBright} style={{ fontFamily: FONTS.extrabold }}>
              {current.actionLabel}
            </Txt>
          </PressableScale>
        ) : null}
      </Animated.View>
    </View>
  );
}
