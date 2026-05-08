/**
 * permission-onboarding.tsx — Presentation Layer
 *
 * Full-screen, first-launch permission onboarding flow.
 * Equivalent to Flutter's permission_onboarding_screen.dart (PageView pattern).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * VISUAL DECEPTION STRATEGY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This screen looks like a standard calculator companion app setup wizard.
 * Every permission step uses innocent, neutral language. No step mentions
 * emergency, SOS, alert, or safety. An observer would assume this is a
 * feature-rich calculator asking for standard app capabilities.
 *
 *  STEP  REAL PURPOSE               DISPLAYED AS
 *  ────  ─────────────────────────  ──────────────────────────────────────────
 *   1    Ambient audio recording    "Voice Memo Recording"
 *   2    GPS for SOS payload        "Location Services"
 *   3    Background timer alerts    "Calculation Reminders"
 *   4    Contact list picker        "Quick Dial Contacts"  (optional, skippable)
 *   5    Battery/Background info    "Background App Refresh" (Android only)
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * BEHAVIOR RULES (matching Flutter spec)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * • One permission at a time — "Allow" triggers the native system dialog.
 * • Critical denial (mic, location) → show non-alarming explanation +
 *   "Open Settings" button that calls openAppSettings() deep-link.
 * • Non-critical denial (contacts) → auto-advance without error.
 * • Final step: markPermissionOnboardingComplete() → navigate to calculator.
 * • The flag persists in AsyncStorage — this screen never shows again.
 *
 * @sprint 1 — MVP
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Animated,
  Platform,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import {
  requestMicrophonePermission,
  requestLocationPermission,
  requestNotificationPermission,
  requestContactsPermission,
  markPermissionOnboardingComplete,
  openAppSettings,
  PermissionStatus,
} from '@/services/permissionService';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Step Definitions ─────────────────────────────────────────────────────────

interface PermissionStep {
  id: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
  gradientColors: [string, string];
  title: string;
  subtitle: string;
  description: string;
  buttonLabel: string;
  denialTitle: string;
  denialMessage: string;
  critical: boolean;   // Critical = must-have for core SOS function
  androidOnly?: boolean;
  requestFn: () => Promise<PermissionStatus>;
}

const PERMISSION_STEPS: PermissionStep[] = [
  // ── Step 1: Microphone ────────────────────────────────────────────────────
  {
    id: 'microphone',
    icon: 'mic',
    iconColor: '#30D158',
    gradientColors: ['rgba(48,209,88,0.15)', 'transparent'],
    title: 'Voice Memo Recording',
    subtitle: 'Speak, calculate, save',
    description:
      'Calculator+ can capture quick voice memos tied to your calculations. ' +
      'Dictate notes, narrate results, or record step-by-step explanations ' +
      'hands-free without touching the screen.',
    buttonLabel: 'Enable Microphone',
    denialTitle: 'Microphone Access Needed',
    denialMessage:
      'Voice memos require microphone access. To enable it, go to Settings → ' +
      'Privacy & Security → Microphone and turn on Calculator+.',
    critical: true,
    requestFn: requestMicrophonePermission,
  },

  // ── Step 2: Location ─────────────────────────────────────────────────────
  {
    id: 'location',
    icon: 'location-on',
    iconColor: '#0A84FF',
    gradientColors: ['rgba(10,132,255,0.15)', 'transparent'],
    title: 'Location Services',
    subtitle: 'Tag calculations with place',
    description:
      'Calculator+ can attach your current location to saved calculations and ' +
      'exports — useful when tracking expenses by location, logging field ' +
      'measurements, or sharing results with a geographical reference.',
    buttonLabel: 'Enable Location',
    denialTitle: 'Location Access Needed',
    denialMessage:
      'Location tagging requires access to your device location. To enable it, ' +
      'go to Settings → Privacy & Security → Location Services and set ' +
      'Calculator+ to "Always".',
    critical: true,
    requestFn: requestLocationPermission,
  },

  // ── Step 3: Notifications ─────────────────────────────────────────────────
  {
    id: 'notifications',
    icon: 'notifications',
    iconColor: '#FF9F0A',
    gradientColors: ['rgba(255,159,10,0.15)', 'transparent'],
    title: 'Calculation Reminders',
    subtitle: 'Timers and session alerts',
    description:
      'Calculator+ can notify you when a calculation timer ends or when a ' +
      'background session requires your attention. Alerts are silent by default ' +
      'and only appear when the app is not on screen.',
    buttonLabel: 'Enable Notifications',
    denialTitle: 'Notifications Turned Off',
    denialMessage:
      'You can re-enable notifications at any time in Settings → ' +
      'Notifications → Calculator+. Timer alerts will still work while the ' +
      'app is open.',
    critical: false, // Degrades gracefully — timer still works in-app
    requestFn: requestNotificationPermission,
  },

  // ── Step 4: Contacts ─────────────────────────────────────────────────────
  {
    id: 'contacts',
    icon: 'people',
    iconColor: '#BF5AF2',
    gradientColors: ['rgba(191,90,242,0.15)', 'transparent'],
    title: 'Quick Dial Contacts',
    subtitle: 'Share results instantly',
    description:
      'Calculator+ can access your contacts so you can quickly send ' +
      'calculation results or share exports with saved people directly from ' +
      'the app — no copy-pasting numbers.',
    buttonLabel: 'Enable Contacts',
    denialTitle: 'Contacts Not Enabled',
    denialMessage:
      'You can still add contacts manually in Calculator Settings. ' +
      'To allow phone-book access later, go to Settings → Privacy & ' +
      'Security → Contacts.',
    critical: false, // Optional — manual entry is available
    requestFn: requestContactsPermission,
  },
];

// Android-only battery step (informational — no system dialog)
const BATTERY_STEP = {
  id: 'battery',
  icon: 'battery-charging-full' as keyof typeof MaterialIcons.glyphMap,
  iconColor: '#FFD60A',
  gradientColors: ['rgba(255,214,10,0.15)', 'transparent'] as [string, string],
  title: 'Background App Refresh',
  subtitle: 'Keep timers running reliably',
  description:
    'On some Android devices, aggressive battery optimization may pause Calculator+ ' +
    'in the background and interrupt active timers. To ensure your timers run reliably, ' +
    'tap "Allow Background Use" below to exempt this app from battery optimization.',
  buttonLabel: 'Allow Background Use',
  denialTitle: '',
  denialMessage: '',
  critical: false,
  androidOnly: true,
  requestFn: async (): Promise<PermissionStatus> => {
    // Battery optimization exemption is not a standard runtime permission —
    // we open Settings directly. The user must manually allow it.
    // Android: Settings → Battery → [App] → Unrestricted
    await openAppSettings();
    return 'granted'; // Always advance — non-blockable
  },
};

// Build final step list based on platform
const STEPS: PermissionStep[] =
  Platform.OS === 'android'
    ? [...PERMISSION_STEPS, BATTERY_STEP]
    : PERMISSION_STEPS;

const TOTAL_STEPS = STEPS.length;

// ─── Step Illustration ────────────────────────────────────────────────────────

function StepIllustration({
  step,
  isGranted,
  isDenied,
}: {
  step: PermissionStep;
  isGranted: boolean;
  isDenied: boolean;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.00, duration: 900, useNativeDriver: true }),
      ])
    );
    if (!isGranted && !isDenied) loop.start();
    else loop.stop();
    return () => loop.stop();
  }, [isGranted, isDenied, pulseAnim]);

  const iconName = isGranted
    ? 'check-circle'
    : isDenied
    ? 'error-outline'
    : step.icon;

  const iconColor = isGranted
    ? '#30D158'
    : isDenied
    ? '#FF453A'
    : step.iconColor;

  return (
    <View style={illStyles.container}>
      <LinearGradient
        colors={step.gradientColors}
        style={illStyles.gradient}
      />
      <Animated.View
        style={[
          illStyles.outerRing,
          { borderColor: iconColor + '33', transform: [{ scale: pulseAnim }] },
        ]}
      >
        <View style={[illStyles.innerRing, { borderColor: iconColor + '66' }]}>
          <View style={[illStyles.iconBg, { backgroundColor: iconColor + '22' }]}>
            <MaterialIcons name={iconName} size={64} color={iconColor} />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const illStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 220,
    marginBottom: Spacing.lg,
  },
  gradient: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 999,
  },
  outerRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBg: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const progressAnim = useRef(new Animated.Value(current / total)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (current + 1) / total,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [current, total, progressAnim]);

  return (
    <View style={pbStyles.track}>
      <Animated.View
        style={[
          pbStyles.fill,
          { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
}

const pbStyles = StyleSheet.create({
  track: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginHorizontal: Spacing.lg,
  },
  fill: {
    height: '100%',
    backgroundColor: '#0A84FF',
    borderRadius: 2,
  },
});

// ─── Denial State UI ──────────────────────────────────────────────────────────

function DenialPanel({
  step,
  onOpenSettings,
  onSkip,
}: {
  step: PermissionStep;
  onOpenSettings: () => void;
  onSkip: () => void;
}) {
  return (
    <View style={dStyles.container}>
      <View style={dStyles.card}>
        <MaterialIcons name="info-outline" size={22} color="#FF9F0A" />
        <View style={{ flex: 1 }}>
          <Text style={dStyles.title}>{step.denialTitle}</Text>
          <Text style={dStyles.message}>{step.denialMessage}</Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [dStyles.settingsBtn, pressed && { opacity: 0.8 }]}
        onPress={onOpenSettings}
      >
        <MaterialIcons name="settings" size={16} color="#fff" />
        <Text style={dStyles.settingsBtnText}>Open Settings</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [dStyles.skipBtn, pressed && { opacity: 0.7 }]}
        onPress={onSkip}
      >
        <Text style={dStyles.skipText}>
          {step.critical ? 'Continue Anyway' : 'Skip for Now'}
        </Text>
      </Pressable>
    </View>
  );
}

const dStyles = StyleSheet.create({
  container: { gap: Spacing.sm, marginTop: Spacing.md },
  card: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,159,10,0.08)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.2)',
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: '#FF9F0A',
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: '#0A84FF',
  },
  settingsBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: '#fff',
  },
  skipBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipText: {
    fontSize: FontSize.sm,
    color: Colors.textSubtle,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PermissionOnboardingScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading]           = useState(false);

  /**
   * Per-step status tracking:
   * null = not yet requested
   * PermissionStatus = result after system dialog
   */
  const [stepStatuses, setStepStatuses] = useState<(PermissionStatus | null)[]>(
    Array(TOTAL_STEPS).fill(null)
  );

  // Slide animation for step transitions
  const slideAnim = useRef(new Animated.Value(0)).current;

  const animateToNext = useCallback(() => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -SCREEN_WIDTH, duration: 220, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: SCREEN_WIDTH,  duration: 0,   useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(slideAnim, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    });
  }, [slideAnim]);

  const currentStep   = STEPS[currentIndex];
  const currentStatus = stepStatuses[currentIndex];
  const isDenied      = currentStatus === 'denied' || currentStatus === 'permanentlyDenied';
  const isGranted     = currentStatus === 'granted';

  // ── Advance to next step or finish ───────────────────────────────────────

  const advance = useCallback(async () => {
    if (currentIndex < TOTAL_STEPS - 1) {
      animateToNext();
      // Small delay so animation starts before state update
      setTimeout(() => setCurrentIndex(i => i + 1), 100);
    } else {
      // All steps complete → save flag → navigate to calculator
      await markPermissionOnboardingComplete();
      router.replace('/');
    }
  }, [currentIndex, animateToNext, router]);

  // ── Handle "Allow" button press ──────────────────────────────────────────

  const handleAllow = useCallback(async () => {
    setLoading(true);
    const result = await currentStep.requestFn();
    setLoading(false);

    const next = [...stepStatuses];
    next[currentIndex] = result;
    setStepStatuses(next);

    // Auto-advance on grant or non-critical denial
    if (result === 'granted' || !currentStep.critical) {
      await advance();
    }
    // Critical denial → stay on step, show DenialPanel
  }, [currentStep, stepStatuses, currentIndex, advance]);

  // ── Handle skip / continue-anyway ────────────────────────────────────────

  const handleSkip = useCallback(async () => {
    await advance();
  }, [advance]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>

      {/* ── Top Bar ──────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <View style={styles.appBadge}>
          <MaterialIcons name="calculate" size={16} color="#fff" />
          <Text style={styles.appBadgeText}>Calculator+</Text>
        </View>
        <Text style={styles.stepCounter}>
          {currentIndex + 1} of {TOTAL_STEPS}
        </Text>
      </View>

      {/* ── Progress Bar ─────────────────────────────────────────────── */}
      <ProgressBar current={currentIndex} total={TOTAL_STEPS} />

      {/* ── Step Dots ────────────────────────────────────────────────── */}
      <View style={styles.dotsRow}>
        {STEPS.map((s, i) => {
          const st = stepStatuses[i];
          const granted = st === 'granted';
          const denied  = st === 'denied' || st === 'permanentlyDenied';
          return (
            <View
              key={s.id}
              style={[
                styles.dot,
                i === currentIndex && styles.dotActive,
                granted && styles.dotGranted,
                denied  && styles.dotDenied,
              ]}
            />
          );
        })}
      </View>

      {/* ── Animated Step Content ─────────────────────────────────────── */}
      <Animated.View
        style={[styles.stepContent, { transform: [{ translateX: slideAnim }] }]}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Illustration */}
          <StepIllustration
            step={currentStep}
            isGranted={isGranted}
            isDenied={isDenied}
          />

          {/* Title */}
          <Text style={styles.title}>{currentStep.title}</Text>
          <Text style={styles.subtitle}>{currentStep.subtitle}</Text>

          {/* Description */}
          <Text style={styles.description}>{currentStep.description}</Text>

          {/* Android battery step: extra note */}
          {currentStep.id === 'battery' ? (
            <View style={styles.batteryNote}>
              <MaterialIcons name="info-outline" size={14} color={Colors.textSubtle} />
              <Text style={styles.batteryNoteText}>
                This will open your device Settings. Find "Battery" → "Calculator+" → select "Unrestricted".
              </Text>
            </View>
          ) : null}

          {/* Optional badge */}
          {!currentStep.critical ? (
            <View style={styles.optionalBadge}>
              <Text style={styles.optionalBadgeText}>Optional</Text>
            </View>
          ) : null}

          {/* Denial Panel — shown after denied system dialog */}
          {isDenied ? (
            <DenialPanel
              step={currentStep}
              onOpenSettings={openAppSettings}
              onSkip={handleSkip}
            />
          ) : null}

          {/* Granted confirmation */}
          {isGranted ? (
            <View style={styles.grantedRow}>
              <MaterialIcons name="check-circle" size={18} color="#30D158" />
              <Text style={styles.grantedText}>Permission granted</Text>
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>

      {/* ── Bottom CTA ───────────────────────────────────────────────── */}
      <View style={styles.bottomArea}>
        {!isDenied ? (
          <Pressable
            style={({ pressed }) => [
              styles.allowBtn,
              { backgroundColor: currentStep.iconColor },
              pressed && { opacity: 0.85 },
              loading && { opacity: 0.6 },
            ]}
            onPress={handleAllow}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : isGranted ? (
              <>
                <MaterialIcons name="arrow-forward" size={18} color="#fff" />
                <Text style={styles.allowBtnText}>
                  {currentIndex < TOTAL_STEPS - 1 ? 'Next' : 'Get Started'}
                </Text>
              </>
            ) : (
              <>
                <MaterialIcons name="lock-open" size={18} color="#fff" />
                <Text style={styles.allowBtnText}>{currentStep.buttonLabel}</Text>
              </>
            )}
          </Pressable>
        ) : null}

        {/* Skip link for non-critical steps (shown alongside denial OR as standalone) */}
        {!isDenied && !currentStep.critical && !isGranted ? (
          <Pressable
            style={({ pressed }) => [styles.skipLink, pressed && { opacity: 0.6 }]}
            onPress={handleSkip}
          >
            <Text style={styles.skipLinkText}>Skip for now</Text>
          </Pressable>
        ) : null}

        {/* Final skip — let user bypass remaining steps and go straight to app */}
        {currentIndex >= 2 && !isDenied ? (
          <Pressable
            style={({ pressed }) => [styles.goToAppLink, pressed && { opacity: 0.6 }]}
            onPress={async () => {
              await markPermissionOnboardingComplete();
              router.replace('/');
            }}
          >
            <Text style={styles.goToAppText}>Skip remaining and open app</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  appBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appBadgeText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  stepCounter: {
    fontSize: FontSize.sm,
    color: Colors.textSubtle,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#0A84FF',
  },
  dotGranted: {
    backgroundColor: '#30D158',
  },
  dotDenied: {
    backgroundColor: '#FF453A',
  },
  stepContent: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSubtle,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  description: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  batteryNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,214,10,0.06)',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,214,10,0.15)',
  },
  batteryNoteText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSubtle,
    lineHeight: 18,
  },
  optionalBadge: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: Spacing.sm,
  },
  optionalBadgeText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: Colors.textSubtle,
    letterSpacing: 0.6,
  },
  grantedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(48,209,88,0.08)',
  },
  grantedText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: '#30D158',
  },
  bottomArea: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  allowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 17,
    borderRadius: BorderRadius.lg,
  },
  allowBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: '#fff',
  },
  skipLink: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  skipLinkText: {
    fontSize: FontSize.sm,
    color: Colors.textSubtle,
  },
  goToAppLink: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  goToAppText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.2)',
  },
});
