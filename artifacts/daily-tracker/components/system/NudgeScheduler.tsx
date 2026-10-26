import { useEffect, useLayoutEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import type { NudgeActionKind } from '@/src/domain/nudges/planner';
import { currentZone } from '@/src/domain/time/clock';
import {
  NOTIFICATIONS_SUPPORTED,
  addResponseListener,
  cancelAll,
  consumeLaunchResponse,
  getPermission,
  beginHandling,
  endHandling,
  registerBackgroundReplan,
  type NudgeResponse,
} from '@/src/services/notifications';
import { registerResponseTask } from '@/src/services/nudgeTasks';
import { contextFor, syncStateToOs } from '@/src/services/replan';
import { firedActions, nudgeResponseActions, type CommandContext } from '@/src/state/commands';
import { nudgePlan } from '@/src/state/selectors';
import { useTracker } from '@/src/state/TrackerProvider';

/**
 * Keeps the OS notification schedule equal to the planner's output and turns
 * notification button presses into state changes. Renders nothing.
 */
export function NudgeScheduler() {
  const { state, ready, nowMs, zone, today, apply } = useTracker();
  const router = useRouter();
  const latest = useRef({ state, today, nowMs, zone });
  // Written after commit, not during render (a render-phase ref write makes the compiler skip
  // this component); every reader below is a listener or a timer, which runs after commit anyway.
  useLayoutEffect(() => {
    latest.current = { state, today, nowMs, zone };
  });

  // One instant, and the day derived from it. The rendered `today` is refreshed on a 30-second tick,
  // so a press right after the 3 am boundary (or a zone change) would otherwise be stamped with the
  // new instant under the previous day.
  const ctx = (state: typeof latest.current.state): CommandContext => contextFor(state, Date.now(), currentZone());

  const handle = async (r: NudgeResponse) => {
    if (!(await beginHandling(r.key))) return;
    // Decided against the newest state (a press right after a tap on Today, or two presses in the
    // same tick, see each other). The durable "handled" mark is written only once the state write
    // committed, so a crash in between replays the press rather than losing it (the ledger dedupes
    // the replay). A save that gave up just releases the claim.
    const { next, persisted } = await apply((s) => nudgeResponseActions(s, r.payload, r.action as NudgeActionKind | 'TAP', ctx(s)));
    await endHandling(r.key, persisted);
    if (r.action === 'TAP') {
      // Land where the notification is about: the cycle tab for cycle reminders, the habit page
      // when the habit still exists, Today otherwise (a Sugar Shield walk without the habit added
      // carries a placeholder id; pushing it would show "This habit no longer exists").
      const id = r.payload.habitIds.find((h) => next.habits.some((x) => x.id === h && !x.archived));
      if (r.payload.kind === 'CYCLE') router.push(next.settings.cycleEnabled ? '/cycle' : '/');
      else if (r.payload.kind === 'SUMMARY' || r.payload.kind === 'EVENT' || !id) router.push('/');
      else router.push({ pathname: '/habit/[id]', params: { id } });
    }
  };

  // Listeners, headless task registration, the response that launched the app.
  useEffect(() => {
    if (!NOTIFICATIONS_SUPPORTED || !ready) return;
    const remove = addResponseListener((r) => void handle(r));
    void registerResponseTask();
    void registerBackgroundReplan();
    void consumeLaunchResponse().then((r) => r && handle(r));
    return remove;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Re-plan whenever the plan changes (state or the minute), debounced.
  const plan = ready ? nudgePlan(state, today, nowMs, zone) : null;
  const planKey = plan ? plan.map((n) => `${n.id}@${n.at}:${n.habitIds.join(',')}:${n.body}`).join('|') : '';
  const enabled = state.settings.remindersEnabled;
  const tapMl = state.settings.tapSizeMl;
  const units = state.settings.units;
  useEffect(() => {
    if (!NOTIFICATIONS_SUPPORTED || !ready) return;
    const timer = setTimeout(async () => {
      try {
        if (!enabled) {
          await cancelAll();
          return;
        }
        if ((await getPermission()) !== 'granted') return;
        const c = ctx(latest.current.state);
        const fired = await syncStateToOs(latest.current.state, c);
        await apply((s) => [...firedActions(s, fired, c), { type: 'PRUNE_EVENTS', beforeMs: c.nowMs - 60 * 60_000 }]);
      } catch (err) {
        console.warn('Notification sync failed', err);
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, planKey, enabled, tapMl, units]);

  // Permission can change in system settings while we are away: re-sync on foreground.
  useEffect(() => {
    if (!NOTIFICATIONS_SUPPORTED) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || !latest.current.state.settings.remindersEnabled) return;
      void (async () => {
        if ((await getPermission()) !== 'granted') return;
        const c = ctx(latest.current.state);
        const fired = await syncStateToOs(latest.current.state, c);
        await apply((s) => firedActions(s, fired, c));
      })().catch((err) => console.warn('Notification sync failed', err));
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
