/**
 * useSosController.ts — Hook Layer (sos_state_controller equivalent)
 *
 * Mod 1: PIN trigger REMOVED. Replaced with 3-second press-and-hold on any
 *        calculator button. Zero visual feedback during the hold — the
 *        calculator appears completely unresponsive to any observer.
 *
 * Mod 4: Safety timer SOS path integrated — executeSosProtocol is called
 *        with triggerMethod: 'timer' when the dead-man's switch expires.
 *
 * State Machine:
 *   DECOY ──(3s hold detected)──► TRIGGERING ──(protocol runs)──► ACTIVE
 *         ──(timer expires)──────►                               ──► COMPLETED / ERROR
 *         ◄──(reset)──────────────────────────────────────────────
 *
 * @sprint 1 — MVP (Mod 1 + 4)
 */

import { useState, useCallback, useRef, useContext, useEffect } from 'react';
import { executeSosProtocol, SosSessionLog } from '@/services/emergencyProtocolService';
import { SOS_CONFIG } from '@/constants/config';
import { SettingsContext } from '@/contexts/SettingsContext';
import { useSafetyTimer } from '@/hooks/useSafetyTimer';

// ─── State Types ──────────────────────────────────────────────────────────────

export type SosMode = 'DECOY' | 'TRIGGERING' | 'ACTIVE' | 'COMPLETED' | 'ERROR';

export type SosStep =
  | 'IDLE'
  | 'INITIATED'
  | 'ACQUIRING_LOCATION'
  | 'RECORDING_STARTED'
  | 'DISPATCHING_SMS'
  | 'UPLOADING_AUDIO'
  | 'COMPLETED'
  | 'FAILED';

export interface SosState {
  mode: SosMode;
  currentStep: SosStep;
  sessionLog: SosSessionLog | null;
  stepHistory: string[];
  triggeredAt: number | null;
  triggerMethod: 'hold' | 'timer' | null;
}

export interface CalculatorState {
  display: string;
  inputBuffer: string;
  previousValue: string;
  operator: string | null;
  shouldResetDisplay: boolean;
  justEvaluated: boolean;
}

const INITIAL_CALCULATOR: CalculatorState = {
  display: '0',
  inputBuffer: '',
  previousValue: '',
  operator: null,
  shouldResetDisplay: false,
  justEvaluated: false,
};

const INITIAL_SOS: SosState = {
  mode: 'DECOY',
  currentStep: 'IDLE',
  sessionLog: null,
  stepHistory: [],
  triggeredAt: null,
  triggerMethod: null,
};

// ─── Calculator Math ──────────────────────────────────────────────────────────

const performCalculation = (a: number, op: string, b: number): number => {
  switch (op) {
    case '+': return a + b;
    case '−': return a - b;
    case '×': return a * b;
    case '÷': return b !== 0 ? a / b : NaN;
    default:  return b;
  }
};

const formatResult = (value: number): string => {
  if (isNaN(value) || !isFinite(value)) return 'Error';
  const str = value.toString();
  if (str.includes('.') && str.length > 12) {
    return parseFloat(value.toPrecision(10)).toString();
  }
  return str.length > 12 ? value.toExponential(6) : str;
};

// ─── Main Hook ────────────────────────────────────────────────────────────────

export function useSosController() {
  const [calc, setCalc] = useState<CalculatorState>(INITIAL_CALCULATOR);
  const [sos, setSos]   = useState<SosState>(INITIAL_SOS);
  const sosActiveRef    = useRef(false);

  const settings = useContext(SettingsContext);

  // Always-fresh contacts ref
  const activeContactsRef = useRef(
    settings?.contacts?.length ? settings.contacts : SOS_CONFIG.EMERGENCY_CONTACTS
  );
  useEffect(() => {
    activeContactsRef.current = settings?.contacts?.length
      ? settings.contacts
      : SOS_CONFIG.EMERGENCY_CONTACTS;
  }, [settings?.contacts]);

  // ── Clear Calculator ───────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    setCalc(INITIAL_CALCULATOR);
  }, []);

  useEffect(() => {
    settings?.registerClearCalculator(handleClear);
  }, [settings, handleClear]);

  // ── SOS Progress Callbacks ─────────────────────────────────────────────

  const handleSosProgress = useCallback((step: string, detail?: string) => {
    setSos(prev => ({
      ...prev,
      currentStep: step as SosStep,
      stepHistory: [
        ...prev.stepHistory,
        `[${new Date().toISOString()}] ${step}${detail ? ` — ${detail}` : ''}`,
      ],
    }));
  }, []);

  // ── Core SOS Activator ─────────────────────────────────────────────────

  /**
   * activateSosProtocol()
   *
   * Shared by BOTH trigger paths (Mod 1: hold gesture, Mod 4: timer expiry).
   * The calculator UI never changes regardless of which path invokes this.
   */
  const activateSosProtocol = useCallback(async (
    method: 'hold' | 'timer'
  ) => {
    if (sosActiveRef.current) return; // idempotency guard
    sosActiveRef.current = true;

    setSos(prev => ({
      ...prev,
      mode: 'TRIGGERING',
      triggeredAt: Date.now(),
      triggerMethod: method,
      stepHistory: [],
    }));

    try {
      setSos(prev => ({ ...prev, mode: 'ACTIVE' }));

      const sessionLog = await executeSosProtocol(
        activeContactsRef.current,
        handleSosProgress,
        method
      );

      setSos(prev => ({
        ...prev,
        mode: 'COMPLETED',
        sessionLog,
        currentStep: 'COMPLETED',
      }));
    } catch (error) {
      console.error('[SosController] Protocol execution failed:', error);
      setSos(prev => ({
        ...prev,
        mode: 'ERROR',
        currentStep: 'FAILED',
      }));
    } finally {
      sosActiveRef.current = false;
    }
  }, [handleSosProgress]);

  // ── Mod 4: Safety Timer SOS path ──────────────────────────────────────

  const handleTimerExpired = useCallback(() => {
    console.log('[SosController] ⏰ Safety timer expired — auto-activating SOS');
    activateSosProtocol('timer');
  }, [activateSosProtocol]);

  const safetyTimer = useSafetyTimer(handleTimerExpired);

  // ── Mod 1: Press-and-Hold Trigger ─────────────────────────────────────

  /**
   * handleLongPress()
   *
   * Called by CalculatorButton after 3 continuous seconds of hold.
   * Releases that don't complete the 3s window call handleLongPressCancel()
   * which is a no-op — achieving zero visible feedback.
   *
   * BDD (Mod 1):
   *   Given the user holds any calculator button for 3 full seconds,
   *   When onLongPress fires (delayLongPress={3000}),
   *   Then activateSosProtocol('hold') is called silently.
   *
   *   Given the user releases the button before 3 seconds,
   *   When the hold is interrupted,
   *   Then no SOS action occurs and the calculator shows no change.
   */
  const handleLongPress = useCallback(() => {
    // If timer is running on the "." button — disarm instead
    // (see handleDotLongPress in app/index.tsx for the full routing logic)
    activateSosProtocol('hold');
  }, [activateSosProtocol]);

  const handleLongPressCancel = useCallback(() => {
    // Intentional no-op — releasing early must silently cancel with zero feedback
    // Matches: "releasing early must silently cancel the gesture with no visible feedback"
  }, []);

  const dismissSosStatus = useCallback(() => {
    setSos(INITIAL_SOS);
  }, []);

  // ── Standard Calculator Input ──────────────────────────────────────────

  const handleDigit = useCallback((digit: string) => {
    setCalc(prev => {
      if (prev.display === '0' && digit !== '.') {
        return { ...prev, display: digit, inputBuffer: digit, justEvaluated: false };
      }
      if (digit === '.' && prev.display.includes('.')) return prev;
      const newDisplay = prev.shouldResetDisplay ? digit : prev.display + digit;
      const newBuffer  = prev.shouldResetDisplay
        ? digit
        : (prev.justEvaluated ? digit : prev.inputBuffer + digit);
      return {
        ...prev,
        display: newDisplay,
        inputBuffer: newBuffer,
        shouldResetDisplay: false,
        justEvaluated: false,
      };
    });
  }, []);

  const handleOperator = useCallback((op: string) => {
    setCalc(prev => {
      const current = parseFloat(prev.display);
      if (prev.operator && !prev.shouldResetDisplay) {
        const previous = parseFloat(prev.previousValue);
        const result   = performCalculation(previous, prev.operator, current);
        return {
          ...prev,
          display: formatResult(result),
          previousValue: formatResult(result),
          operator: op,
          inputBuffer: '',
          shouldResetDisplay: true,
          justEvaluated: false,
        };
      }
      return {
        ...prev,
        previousValue: prev.display,
        operator: op,
        inputBuffer: '',
        shouldResetDisplay: true,
        justEvaluated: false,
      };
    });
  }, []);

  const handleEquals = useCallback(() => {
    setCalc(prev => {
      // Mod 1: PIN detection removed entirely. "=" is now a pure calculator operation.
      if (!prev.operator) {
        return { ...prev, shouldResetDisplay: true, justEvaluated: true };
      }
      const a      = parseFloat(prev.previousValue);
      const b      = parseFloat(prev.display);
      const result = performCalculation(a, prev.operator, b);
      return {
        ...prev,
        display: formatResult(result),
        previousValue: '',
        operator: null,
        inputBuffer: '',
        shouldResetDisplay: true,
        justEvaluated: true,
      };
    });
  }, []);

  const handleToggleSign = useCallback(() => {
    setCalc(prev => {
      const value = parseFloat(prev.display);
      if (isNaN(value) || value === 0) return prev;
      return { ...prev, display: (value * -1).toString() };
    });
  }, []);

  const handlePercent = useCallback(() => {
    setCalc(prev => {
      const value = parseFloat(prev.display);
      if (isNaN(value)) return prev;
      const result = value / 100;
      return {
        ...prev,
        display: result.toString(),
        inputBuffer: result.toString(),
        justEvaluated: true,
      };
    });
  }, []);

  return {
    calc,
    sos,
    safetyTimer,
    handleDigit,
    handleOperator,
    handleEquals,
    handleClear,
    handleToggleSign,
    handlePercent,
    handleLongPress,
    handleLongPressCancel,
    dismissSosStatus,
  };
}
