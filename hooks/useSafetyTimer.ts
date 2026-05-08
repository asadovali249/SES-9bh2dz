/**
 * useSafetyTimer.ts — Hook Layer (safety_timer_controller equivalent)
 *
 * Mod 4: Dead-man's switch countdown timer.
 *
 * STATE MACHINE:
 *   IDLE ──(start)──► RUNNING ──(disarm gesture / cancel)──► IDLE
 *                             ──(countdown reaches 0)──────► EXPIRED → SOS fires
 *
 * BACKGROUND SURVIVAL STRATEGY (React Native equivalent of workmanager):
 *   When the app is backgrounded, AppState fires a 'background' event.
 *   We persist the timer's target expiry timestamp to AsyncStorage.
 *   On return to foreground (AppState 'active'), we reload the timestamp
 *   and check if it already expired — if so, fire SOS immediately.
 *   If not, resume countdown from remaining time.
 *
 *   iOS / Android difference:
 *   • iOS: JS runtime pauses after ~30s in background. The AppState check
 *     on resume is the primary safety net. For true background execution,
 *     a native module or BGTaskScheduler would be needed (out of Expo scope).
 *   • Android: JS runtime survives longer. The AppState resume check is
 *     generally sufficient for timers under ~10 minutes.
 *   • Both: If the process is killed, the persisted timestamp is read on
 *     next cold launch and SOS fires immediately if expired.
 *
 * TRIGGER ENTRY POINT (Mod 4):
 *   Long-press "." (3 seconds) → opens TimerSheet from bottom.
 *   User picks duration → taps Start.
 *   Same long-press on "." → disarms and returns to IDLE.
 *
 * @sprint 1 — MVP (Mod 4)
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimerStatus = 'IDLE' | 'RUNNING' | 'EXPIRED';

export interface SafetyTimerState {
  status: TimerStatus;
  remainingSeconds: number;
  totalSeconds: number;
  startedAt: number | null;
  expiresAt: number | null;
}

const STORAGE_KEY_EXPIRY    = '@ses_timer_expiry';
const STORAGE_KEY_TOTAL     = '@ses_timer_total';

const INITIAL_STATE: SafetyTimerState = {
  status: 'IDLE',
  remainingSeconds: 0,
  totalSeconds: 0,
  startedAt: null,
  expiresAt: null,
};

// Min 1 minute, max 4 hours (Mod 4 spec)
export const TIMER_MIN_SECONDS = 60;
export const TIMER_MAX_SECONDS = 4 * 60 * 60;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param onExpired Callback invoked when the timer reaches zero.
 *                  The caller (useSosController) will fire executeSosProtocol.
 */
export function useSafetyTimer(onExpired: () => void) {
  const [timerState, setTimerState] = useState<SafetyTimerState>(INITIAL_STATE);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef    = useRef<AppStateStatus>(AppState.currentState);
  const onExpiredRef   = useRef(onExpired);

  // Keep callback ref fresh without re-triggering effects
  useEffect(() => { onExpiredRef.current = onExpired; }, [onExpired]);

  // ── Countdown tick ──────────────────────────────────────────────────────

  const startTick = useCallback((expiresAt: number, totalSeconds: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const tick = () => {
      const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setTimerState(prev => ({ ...prev, remainingSeconds: remaining }));

      if (remaining <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setTimerState({ ...INITIAL_STATE, status: 'EXPIRED' });
        console.log('[SafetyTimer] ⏰ Timer EXPIRED — triggering SOS protocol');
        AsyncStorage.multiRemove([STORAGE_KEY_EXPIRY, STORAGE_KEY_TOTAL]).catch(() => {});
        onExpiredRef.current();
      }
    };

    tick(); // immediate first tick
    intervalRef.current = setInterval(tick, 1000);
  }, []);

  // ── Start timer ─────────────────────────────────────────────────────────

  /**
   * startTimer(durationSeconds)
   * Clamps to [TIMER_MIN_SECONDS, TIMER_MAX_SECONDS].
   * Persists expiry timestamp for background survival.
   */
  const startTimer = useCallback(async (durationSeconds: number) => {
    const clamped = Math.min(
      Math.max(durationSeconds, TIMER_MIN_SECONDS),
      TIMER_MAX_SECONDS
    );
    const now       = Date.now();
    const expiresAt = now + clamped * 1000;

    // Persist so background/cold-launch can check
    await AsyncStorage.multiSet([
      [STORAGE_KEY_EXPIRY, String(expiresAt)],
      [STORAGE_KEY_TOTAL,  String(clamped)],
    ]);

    const next: SafetyTimerState = {
      status: 'RUNNING',
      remainingSeconds: clamped,
      totalSeconds: clamped,
      startedAt: now,
      expiresAt,
    };
    setTimerState(next);
    startTick(expiresAt, clamped);
    console.log(`[SafetyTimer] ▶ Started — ${clamped}s | expires ${new Date(expiresAt).toISOString()}`);
  }, [startTick]);

  // ── Disarm timer ────────────────────────────────────────────────────────

  /**
   * disarmTimer()
   * Called by the 3-second hold on "." — silently cancels with no UI change.
   * Also called by the cancel button inside the TimerSheet.
   */
  const disarmTimer = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    await AsyncStorage.multiRemove([STORAGE_KEY_EXPIRY, STORAGE_KEY_TOTAL]);
    setTimerState(INITIAL_STATE);
    console.log('[SafetyTimer] 🔕 Timer DISARMED');
  }, []);

  // ── Background / Foreground handling ────────────────────────────────────
  // React Native equivalent of workmanager / flutter_background_service

  useEffect(() => {
    /**
     * On app resume: reload persisted expiry and either:
     *   A) fire SOS immediately if already expired
     *   B) resume countdown from remaining time
     */
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev.match(/inactive|background/) && nextState === 'active') {
        console.log('[SafetyTimer] 📲 App foregrounded — checking persisted timer...');
        try {
          const [[, expiryStr], [, totalStr]] = await AsyncStorage.multiGet([
            STORAGE_KEY_EXPIRY,
            STORAGE_KEY_TOTAL,
          ]);

          if (!expiryStr) return; // No timer was running

          const expiresAt   = parseInt(expiryStr, 10);
          const totalSeconds = parseInt(totalStr ?? '0', 10);
          const remaining   = Math.round((expiresAt - Date.now()) / 1000);

          if (remaining <= 0) {
            // Expired while backgrounded — fire SOS
            console.log('[SafetyTimer] ⏰ Expired in background — firing SOS');
            await AsyncStorage.multiRemove([STORAGE_KEY_EXPIRY, STORAGE_KEY_TOTAL]);
            setTimerState({ ...INITIAL_STATE, status: 'EXPIRED' });
            onExpiredRef.current();
          } else {
            // Resume countdown
            console.log(`[SafetyTimer] ↩️  Resuming — ${remaining}s remaining`);
            setTimerState({
              status: 'RUNNING',
              remainingSeconds: remaining,
              totalSeconds,
              startedAt: Date.now() - (totalSeconds - remaining) * 1000,
              expiresAt,
            });
            startTick(expiresAt, totalSeconds);
          }
        } catch (err) {
          console.error('[SafetyTimer] AppState resume error:', err);
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);

    // Cold-launch check: if there's a persisted timer from a previous session
    (async () => {
      try {
        const [[, expiryStr], [, totalStr]] = await AsyncStorage.multiGet([
          STORAGE_KEY_EXPIRY,
          STORAGE_KEY_TOTAL,
        ]);
        if (!expiryStr) return;

        const expiresAt   = parseInt(expiryStr, 10);
        const totalSeconds = parseInt(totalStr ?? '0', 10);
        const remaining   = Math.round((expiresAt - Date.now()) / 1000);

        if (remaining <= 0) {
          console.log('[SafetyTimer] ⏰ Expired before cold launch — firing SOS');
          await AsyncStorage.multiRemove([STORAGE_KEY_EXPIRY, STORAGE_KEY_TOTAL]);
          setTimerState({ ...INITIAL_STATE, status: 'EXPIRED' });
          onExpiredRef.current();
        } else {
          console.log(`[SafetyTimer] ↩️  Cold-launch resume — ${remaining}s remaining`);
          setTimerState({
            status: 'RUNNING',
            remainingSeconds: remaining,
            totalSeconds,
            startedAt: Date.now() - (totalSeconds - remaining) * 1000,
            expiresAt,
          });
          startTick(expiresAt, totalSeconds);
        }
      } catch { /* ignore on cold launch */ }
    })();

    return () => {
      sub.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startTick]);

  // ── Helpers ─────────────────────────────────────────────────────────────

  const isRunning = timerState.status === 'RUNNING';

  /** Human-readable countdown string e.g. "14:37" */
  const formattedRemaining = (() => {
    const s = timerState.remainingSeconds;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  })();

  /** Progress 0–1 for optional UI indicator */
  const progress = timerState.totalSeconds > 0
    ? timerState.remainingSeconds / timerState.totalSeconds
    : 0;

  return {
    timerState,
    isRunning,
    formattedRemaining,
    progress,
    startTimer,
    disarmTimer,
  };
}
