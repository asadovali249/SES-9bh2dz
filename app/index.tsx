/**
 * calculator_screen → app/index.tsx (Mod 1 + 4 applied)
 *
 * Mod 1: Removed PIN input detection entirely.
 *        All buttons now accept onLongPress={handleLongPress} (3s hold = SOS).
 *        "." button additionally handles timer open/disarm via onDotLongPress.
 *
 * Mod 4: Safety Timer integration.
 *        3s hold on "." → opens TimerSheet (bottom sheet).
 *        If timer already running → 3s hold on "." → disarms.
 *        Subtle timer indicator: tiny amber dot in display corner.
 *
 * Permission Revocation Banner (new):
 *        After first-launch onboarding, the app silently re-checks critical
 *        permissions on every launch via usePermissionCheck().
 *        If microphone or location has been revoked, a discreet amber banner
 *        appears at the top of the display area — NOT a popup/alert.
 *        The banner looks like a standard iOS/Android "feature unavailable"
 *        indicator, not an emergency warning.
 *
 * @sprint 1 — MVP (Mod 1 + 4 + Permission Revocation Banner)
 */

import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  Pressable,
  Text,
  Modal,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSosController } from '@/hooks/useSosController';
import { useSettings } from '@/hooks/useSettings';
import { usePermissionCheck } from '@/hooks/usePermissionCheck';
import CalculatorButton from '@/components/feature/CalculatorButton';
import CalculatorDisplay from '@/components/feature/CalculatorDisplay';
import SosStatusOverlay from '@/components/feature/SosStatusOverlay';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '@/constants/theme';
import { TIMER_MIN_SECONDS, TIMER_MAX_SECONDS } from '@/hooks/useSafetyTimer';

// ─── Button Grid ──────────────────────────────────────────────────────────────

type CalcButtonDef = {
  label: string;
  type: 'function' | 'operator' | 'digit' | 'equals';
  wide?: boolean;
  action: 'clear' | 'toggle' | 'percent' | 'operator' | 'digit' | 'equals' | 'dot';
  value?: string;
};

const BUTTON_ROWS: CalcButtonDef[][] = [
  [
    { label: 'AC', type: 'function', action: 'clear' },
    { label: '+/-', type: 'function', action: 'toggle' },
    { label: '%',  type: 'function', action: 'percent' },
    { label: '÷',  type: 'operator', action: 'operator', value: '÷' },
  ],
  [
    { label: '7', type: 'digit', action: 'digit', value: '7' },
    { label: '8', type: 'digit', action: 'digit', value: '8' },
    { label: '9', type: 'digit', action: 'digit', value: '9' },
    { label: '×', type: 'operator', action: 'operator', value: '×' },
  ],
  [
    { label: '4', type: 'digit', action: 'digit', value: '4' },
    { label: '5', type: 'digit', action: 'digit', value: '5' },
    { label: '6', type: 'digit', action: 'digit', value: '6' },
    { label: '−', type: 'operator', action: 'operator', value: '−' },
  ],
  [
    { label: '1', type: 'digit', action: 'digit', value: '1' },
    { label: '2', type: 'digit', action: 'digit', value: '2' },
    { label: '3', type: 'digit', action: 'digit', value: '3' },
    { label: '+', type: 'operator', action: 'operator', value: '+' },
  ],
  [
    { label: '0', type: 'digit', action: 'digit', value: '0', wide: true },
    { label: '.', type: 'digit', action: 'dot' },
    { label: '=', type: 'equals', action: 'equals' },
  ],
];

// ─── Timer Duration Presets ───────────────────────────────────────────────────

const TIMER_PRESETS: { label: string; seconds: number }[] = [
  { label: '1 min',  seconds: 60 },
  { label: '5 min',  seconds: 300 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
  { label: '1 hr',   seconds: 3600 },
  { label: '2 hr',   seconds: 7200 },
  { label: '4 hr',   seconds: TIMER_MAX_SECONDS },
];

// ─── Permission Revocation Banner ─────────────────────────────────────────────

/**
 * Discreet amber strip shown when a critical permission has been revoked.
 * Displayed at the top of the display area — not a popup or modal.
 *
 * Neutral language: "Some features unavailable" — not "SOS disabled".
 * An observer would read this as a standard feature-limitation notice.
 *
 * Equivalent to Flutter's discreet in-app banner (not showDialog).
 */
function PermissionRevocationBanner({
  micRevoked,
  locRevoked,
  onOpenSettings,
  onDismiss,
}: {
  micRevoked: boolean;
  locRevoked: boolean;
  onOpenSettings: () => void;
  onDismiss: () => void;
}) {
  const parts: string[] = [];
  if (micRevoked) parts.push('Voice Input');
  if (locRevoked) parts.push('Location');
  const featureList = parts.join(' & ');

  return (
    <View style={bannerStyles.banner}>
      <View style={bannerStyles.content}>
        <MaterialIcons name="info-outline" size={14} color="#FF9F0A" />
        <Text style={bannerStyles.text} numberOfLines={1}>
          {featureList} unavailable — tap to restore
        </Text>
      </View>
      <View style={bannerStyles.actions}>
        <Pressable
          onPress={onOpenSettings}
          hitSlop={8}
          style={({ pressed }) => [bannerStyles.settingsBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={bannerStyles.settingsBtnText}>Settings</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <MaterialIcons name="close" size={14} color="rgba(255,159,10,0.6)" />
        </Pressable>
      </View>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,159,10,0.09)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,159,10,0.18)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: Spacing.sm,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  text: {
    fontSize: 12,
    color: '#FF9F0A',
    fontWeight: FontWeight.medium,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  settingsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,159,10,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.3)',
  },
  settingsBtnText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: '#FF9F0A',
  },
});

// ─── Timer Sheet ──────────────────────────────────────────────────────────────

function TimerSheet({
  visible,
  isRunning,
  formattedRemaining,
  progress,
  onStart,
  onDisarm,
  onClose,
}: {
  visible: boolean;
  isRunning: boolean;
  formattedRemaining: string;
  progress: number;
  onStart: (seconds: number) => void;
  onDisarm: () => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(300);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={tStyles.root}>
        <View style={tStyles.header}>
          <Text style={tStyles.title}>Calculation Timer</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <MaterialIcons name="close" size={22} color={Colors.textSubtle} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={tStyles.content}
          showsVerticalScrollIndicator={false}
        >
          {isRunning ? (
            <View style={tStyles.runningCard}>
              <MaterialIcons name="timer" size={32} color="#FF9F0A" />
              <View style={{ flex: 1 }}>
                <Text style={tStyles.runningLabel}>Timer Active</Text>
                <Text style={tStyles.runningTime}>{formattedRemaining}</Text>
                <View style={tStyles.progressBar}>
                  <View style={[tStyles.progressFill, { width: `${progress * 100}%` as any }]} />
                </View>
              </View>
            </View>
          ) : (
            <View style={tStyles.idleCard}>
              <MaterialIcons name="timer-off" size={26} color={Colors.textSubtle} />
              <Text style={tStyles.idleText}>No timer active</Text>
            </View>
          )}

          <Text style={tStyles.sublabel}>
            {isRunning
              ? 'Hold the decimal button (.) for 3 seconds to cancel the timer.'
              : 'Set a duration for your calculation session.'}
          </Text>

          {!isRunning ? (
            <>
              <Text style={tStyles.sectionLabel}>DURATION</Text>
              <View style={tStyles.presetGrid}>
                {TIMER_PRESETS.map(p => (
                  <Pressable
                    key={p.seconds}
                    style={({ pressed }) => [
                      tStyles.presetChip,
                      selected === p.seconds && tStyles.presetChipActive,
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={() => setSelected(p.seconds)}
                  >
                    <Text style={[
                      tStyles.presetChipText,
                      selected === p.seconds && tStyles.presetChipTextActive,
                    ]}>
                      {p.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={({ pressed }) => [tStyles.startBtn, pressed && { opacity: 0.8 }]}
                onPress={() => { onStart(selected); onClose(); }}
              >
                <MaterialIcons name="play-arrow" size={20} color="#000" />
                <Text style={tStyles.startBtnText}>Start Timer</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={({ pressed }) => [tStyles.disarmBtn, pressed && { opacity: 0.8 }]}
              onPress={() => { onDisarm(); onClose(); }}
            >
              <MaterialIcons name="stop" size={20} color="#fff" />
              <Text style={tStyles.disarmBtnText}>Cancel Timer</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const tStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111113' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  content: { padding: Spacing.md, gap: Spacing.md },
  runningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: 'rgba(255,159,10,0.08)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.2)',
  },
  runningLabel: { fontSize: FontSize.sm, color: '#FF9F0A', fontWeight: FontWeight.semibold, marginBottom: 2 },
  runningTime:  { fontSize: 36, fontWeight: FontWeight.bold, color: Colors.textPrimary, letterSpacing: 2, marginBottom: 8 },
  progressBar:  { height: 3, backgroundColor: 'rgba(255,159,10,0.2)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%' as any, backgroundColor: '#FF9F0A', borderRadius: 2 },
  idleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#1C1C1E',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  idleText: { fontSize: FontSize.sm, color: Colors.textSubtle },
  sublabel:  { fontSize: FontSize.sm, color: Colors.textSubtle, lineHeight: 20 },
  sectionLabel: { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textSubtle, letterSpacing: 0.8 },
  presetGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  presetChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  presetChipActive: { backgroundColor: 'rgba(255,159,10,0.15)', borderColor: '#FF9F0A' },
  presetChipText:   { fontSize: FontSize.sm, color: Colors.textSubtle, fontWeight: FontWeight.medium },
  presetChipTextActive: { color: '#FF9F0A', fontWeight: FontWeight.semibold },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 15,
    borderRadius: BorderRadius.md,
    backgroundColor: '#FF9F0A',
    marginTop: Spacing.xs,
  },
  startBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: '#000' },
  disarmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 15,
    borderRadius: BorderRadius.md,
    backgroundColor: '#FF453A',
    marginTop: Spacing.xs,
  },
  disarmBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: '#fff' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CalculatorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { onboardingDone, permissions } = useSettings();

  const showSetupHint = !onboardingDone ||
    permissions.microphone !== 'granted' ||
    permissions.location   !== 'granted';

  const {
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
  } = useSosController();

  // ── Permission revocation silent re-check ──────────────────────────────
  const {
    hasRevokedPermissions,
    revokedPermissions,
    goToSettings,
    dismissBanner,
  } = usePermissionCheck();

  const [timerSheetOpen, setTimerSheetOpen] = useState(false);

  // ── Button press routing ───────────────────────────────────────────────

  const onButtonPress = useCallback((btn: CalcButtonDef) => {
    switch (btn.action) {
      case 'digit':
      case 'dot':
        handleDigit(btn.value ?? btn.label);
        break;
      case 'operator':
        handleOperator(btn.value ?? '');
        break;
      case 'equals':
        handleEquals();
        break;
      case 'clear':
        handleClear();
        break;
      case 'toggle':
        handleToggleSign();
        break;
      case 'percent':
        handlePercent();
        break;
    }
  }, [handleDigit, handleOperator, handleEquals, handleClear, handleToggleSign, handlePercent]);

  const handleDotLongPress = useCallback(() => {
    if (safetyTimer.isRunning) {
      safetyTimer.disarmTimer();
    } else {
      setTimerSheetOpen(true);
    }
  }, [safetyTimer]);

  const showSosMonitor = sos.mode !== 'DECOY' && sos.mode !== 'TRIGGERING';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* ── Permission Revocation Banner ──────────────────────────────
          Discreet amber strip — NOT a popup. Appears at top of display.
          Neutral text: "Voice Input & Location unavailable".
          An observer would not interpret this as an SOS warning.
      ────────────────────────────────────────────────────────────── */}
      {hasRevokedPermissions ? (
        <PermissionRevocationBanner
          micRevoked={revokedPermissions.microphone}
          locRevoked={revokedPermissions.location}
          onOpenSettings={goToSettings}
          onDismiss={dismissBanner}
        />
      ) : null}

      {/* Settings gear */}
      <Pressable
        style={styles.settingsButton}
        onPress={() => router.push('/calculator-settings')}
        hitSlop={8}
        accessibilityLabel="Settings"
      >
        <MaterialIcons name="settings" size={20} color="rgba(255,255,255,0.22)" />
        {showSetupHint ? <View style={styles.settingsBadge} /> : null}
      </Pressable>

      {/* Hidden doc nav */}
      <Pressable
        style={styles.hiddenDocButton}
        onPress={() => router.push('/agile-doc')}
        hitSlop={8}
        accessibilityLabel="Documentation"
      >
        <View style={styles.hiddenDot} />
      </Pressable>

      {/* ── Display Area ──────────────────────────────────────────── */}
      <View style={styles.displayWrapper}>
        <CalculatorDisplay
          value={calc.display}
          operator={calc.operator}
          previousValue={calc.previousValue}
        />

        {safetyTimer.isRunning ? (
          <View style={styles.timerIndicator} accessibilityElementsHidden>
            <View style={styles.timerDot} />
          </View>
        ) : null}
      </View>

      {/* ── Button Grid ──────────────────────────────────────────── */}
      <View style={styles.keypad}>
        {BUTTON_ROWS.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.buttonRow}>
            {row.map((btn) => (
              <CalculatorButton
                key={btn.label}
                label={btn.label}
                variant={btn.type}
                wide={btn.wide}
                onPress={() => onButtonPress(btn)}
                onLongPress={btn.label !== '.' ? handleLongPress : undefined}
                onDotLongPress={btn.label === '.' ? handleDotLongPress : undefined}
              />
            ))}
          </View>
        ))}
      </View>

      {/* ── Safety Timer Sheet ──────────────────────────────────── */}
      <TimerSheet
        visible={timerSheetOpen}
        isRunning={safetyTimer.isRunning}
        formattedRemaining={safetyTimer.formattedRemaining}
        progress={safetyTimer.progress}
        onStart={safetyTimer.startTimer}
        onDisarm={safetyTimer.disarmTimer}
        onClose={() => setTimerSheetOpen(false)}
      />

      {/* ── SOS Monitor (dev/debug modal) ───────────────────────── */}
      <Modal
        visible={showSosMonitor}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={dismissSosStatus}
      >
        <SosStatusOverlay
          sosState={sos}
          onDismiss={dismissSosStatus}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  settingsButton: {
    position: 'absolute',
    top: 60,
    left: 16,
    width: 32,
    height: 32,
    zIndex: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF9F0A',
    borderWidth: 1,
    borderColor: Colors.background,
  },
  hiddenDocButton: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 20,
    height: 20,
    zIndex: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  displayWrapper: {
    flex: 1,
    position: 'relative',
  },
  timerIndicator: {
    position: 'absolute',
    bottom: Spacing.md + 2,
    left: Spacing.lg + 4,
    zIndex: 10,
  },
  timerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF9F0A',
  },
  keypad: {
    paddingBottom: 24,
    paddingHorizontal: Spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
