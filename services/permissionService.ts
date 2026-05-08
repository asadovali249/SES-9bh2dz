/**
 * permissionService.ts — Data Layer
 *
 * Comprehensive permission management for SƏS (Səssiz Yardım Sistemi).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * PERMISSION MAP (real purpose → displayed label)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  REAL PURPOSE               DISPLAYED AS (neutral, non-suspicious)
 *  ─────────────────────────────────────────────────────────────────
 *  Ambient audio recording  → "Voice Memo Recording"
 *  GPS for SOS payload      → "Location Services"
 *  SMS emergency dispatch   → Not directly requestable in Expo — handled
 *                             by Twilio REST API from JS, no SMS permission
 *                             needed on the device. Android SMS permission
 *                             is only for reading RECEIVED SMS, not sending.
 *  Background SOS trigger   → "Background App Refresh" (iOS) /
 *                             "Battery Optimization" (Android)
 *  Contact selection        → "Contacts" → "Quick Dial Contacts"
 *  Timer/Service alerts     → "Notifications"
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ANDROID 14+ / iOS 17+ BEHAVIOR NOTES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * iOS 17+:
 *   • Location "Always Allow" is now a 2-step flow: system first grants
 *     "While Using", then prompts separately in Settings for "Always". 
 *     requestBackgroundPermissionsAsync() may return 'denied' on first call
 *     even if the user intends to grant it — the user must go to Settings →
 *     Privacy → Location → [App] → "Always". This is enforced by Apple.
 *   • Microphone access now shows a live orange dot in the status bar
 *     whenever the mic is active. No API to suppress this.
 *   • NSMicrophoneUsageDescription and NSLocationAlwaysAndWhenInUseUsageDescription
 *     are required in app.json / Info.plist.
 *
 * Android 14+:
 *   • ACCESS_BACKGROUND_LOCATION requires a separate runtime permission dialog
 *     that navigates the user directly to the Location permission settings page.
 *     It cannot be requested in the same dialog as foreground location.
 *   • SCHEDULE_EXACT_ALARM (for precise timers) requires a new special
 *     permission granted via Settings → Special App Access on API 33+.
 *   • POST_NOTIFICATIONS is required for Android 13+ (API 33+) — apps targeting
 *     API < 33 do not need it but Expo SDK 50+ targets API 34.
 *   • Battery Optimization exemption (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
 *     can be requested via IntentLauncher but Play Store review may flag it —
 *     the user is directed to Settings manually in this implementation.
 *
 * @sprint 1 — MVP
 */

import { Platform, Linking } from 'react-native';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Mirrors Flutter's permission_handler PermissionStatus enum.
 * permanentlyDenied = user selected "Never Ask Again" (Android) or
 * denied twice (iOS) — only openAppSettings() can recover.
 */
export type PermissionStatus =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'restricted'
  | 'permanentlyDenied';

export interface AppPermissions {
  microphone:    PermissionStatus;
  location:      PermissionStatus;
  notifications: PermissionStatus;
  contacts:      PermissionStatus; // optional — for phone-book contact picker
}

// Key used to persist the first-launch onboarding completion flag
export const ONBOARDING_PERMISSION_KEY = '@ses_permission_onboarding_complete';

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Maps Expo's permission status strings to our unified PermissionStatus type.
 * Expo uses 'granted' | 'denied' | 'undetermined'. It does not distinguish
 * 'permanentlyDenied' natively — we infer it from canAskAgain=false.
 */
function mapStatus(
  status: string,
  canAskAgain?: boolean
): PermissionStatus {
  if (status === 'granted')      return 'granted';
  if (status === 'restricted')   return 'restricted';
  if (status === 'undetermined') return 'undetermined';
  // 'denied' + canAskAgain=false → permanently denied
  if (status === 'denied' && canAskAgain === false) return 'permanentlyDenied';
  return 'denied';
}

// ─── Settings Deep-Link ───────────────────────────────────────────────────────

/**
 * openAppSettings()
 *
 * Opens the app's permission page in the system Settings app.
 * Equivalent to Flutter's permission_handler openAppSettings().
 *
 * iOS:     Opens Settings → [App Name] → permissions panel
 * Android: Opens Settings → Apps → [App Name] → Permissions
 */
export async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch (err) {
    console.error('[Permissions] openAppSettings() failed:', err);
  }
}

// ─── Silent Check (no UI prompt) ─────────────────────────────────────────────

/**
 * checkPermissions()
 *
 * Returns current permission statuses WITHOUT triggering system dialogs.
 * Called on every subsequent launch to detect revoked permissions.
 * Results are used to show discreet in-app banners (not popups).
 *
 * Equivalent to permission_handler: permission.status (without .request())
 */
export async function checkPermissions(): Promise<AppPermissions> {
  try {
    const [micResult, locResult, notifResult, contactResult] = await Promise.all([
      Audio.getPermissionsAsync(),
      Location.getForegroundPermissionsAsync(),
      Notifications.getPermissionsAsync(),
      Contacts.getPermissionsAsync(),
    ]);

    return {
      microphone:    mapStatus(micResult.status,    micResult.canAskAgain === false ? false : undefined),
      location:      mapStatus(locResult.status,    locResult.canAskAgain === false ? false : undefined),
      notifications: mapStatus(notifResult.status,  notifResult.canAskAgain === false ? false : undefined),
      contacts:      mapStatus(contactResult.status, contactResult.canAskAgain === false ? false : undefined),
    };
  } catch (err) {
    console.warn('[Permissions] checkPermissions() error:', err);
    return {
      microphone:    'undetermined',
      location:      'undetermined',
      notifications: 'undetermined',
      contacts:      'undetermined',
    };
  }
}

// ─── Individual Permission Requestors ────────────────────────────────────────

/**
 * requestMicrophonePermission()
 *
 * Requests microphone access via expo-av.
 * Displayed as: "Voice Memo Recording"
 * Real use: Audio.Recording during SOS ambient capture.
 *
 * iOS 17+: Triggers orange dot in status bar when mic is active.
 * Android: RECORD_AUDIO permission.
 */
export async function requestMicrophonePermission(): Promise<PermissionStatus> {
  try {
    const { status, canAskAgain } = await Audio.requestPermissionsAsync();
    console.log('[Permissions] Microphone:', status, '| canAskAgain:', canAskAgain);
    return mapStatus(status, canAskAgain === false ? false : undefined);
  } catch (err) {
    console.error('[Permissions] Microphone request error:', err);
    return 'denied';
  }
}

/**
 * requestLocationPermission()
 *
 * Two-phase: foreground first, then background ("Always Allow").
 * Displayed as: "Location Services"
 * Real use: GPS coordinates embedded in SOS SMS + WhatsApp payload.
 *
 * iOS 17+: Background location is a separate step in Settings only.
 *          requestBackgroundPermissionsAsync may return 'denied' even when
 *          the user intends to grant "Always" — direct them to Settings.
 * Android 14+: ACCESS_BACKGROUND_LOCATION triggers a separate system page.
 *              Foreground alone is sufficient for our SOS use case since
 *              the protocol runs while the app is foregrounded (hold gesture).
 */
export async function requestLocationPermission(): Promise<PermissionStatus> {
  try {
    // Phase 1: Foreground ("While Using App")
    const { status: fgStatus, canAskAgain: fgCanAsk } =
      await Location.requestForegroundPermissionsAsync();

    console.log('[Permissions] Location foreground:', fgStatus);

    if (fgStatus !== 'granted') {
      return mapStatus(fgStatus, fgCanAsk === false ? false : undefined);
    }

    // Phase 2: Background ("Always Allow") — best-effort
    // iOS: Required for SOS while app is backgrounded
    // Android 14+: Navigates to a separate system settings page
    try {
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      console.log('[Permissions] Location background:', bgStatus);
      // Foreground granted is sufficient for core SOS — background is bonus
    } catch (bgErr) {
      console.warn('[Permissions] Background location unavailable:', bgErr);
    }

    return 'granted'; // Foreground was granted — core SOS will work
  } catch (err) {
    console.error('[Permissions] Location request error:', err);
    return 'denied';
  }
}

/**
 * requestNotificationPermission()
 *
 * Requests push/local notification permission.
 * Displayed as: "Calculation Reminders"
 * Real use: Timer expiry alerts, background SOS confirmation.
 *
 * Android 13+ (API 33+): POST_NOTIFICATIONS is a runtime permission.
 * iOS: Standard UNUserNotificationCenter request.
 *
 * Configures alert + sound + badge channels.
 */
export async function requestNotificationPermission(): Promise<PermissionStatus> {
  try {
    const { status, canAskAgain } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: true,
      },
    });
    console.log('[Permissions] Notifications:', status, '| canAskAgain:', canAskAgain);
    return mapStatus(status, canAskAgain === false ? false : undefined);
  } catch (err) {
    console.error('[Permissions] Notification request error:', err);
    return 'denied';
  }
}

/**
 * requestContactsPermission()
 *
 * Optional: Allows users to pick emergency contacts from the phone book
 * instead of typing numbers manually.
 * Displayed as: "Quick Dial Contacts"
 * Real use: Populating SOS contact list from native address book.
 *
 * This permission is non-critical — denial does not block SOS functionality.
 * Users can still enter contacts manually in Calculator Settings.
 *
 * iOS: NSContactsUsageDescription required.
 * Android: READ_CONTACTS permission.
 */
export async function requestContactsPermission(): Promise<PermissionStatus> {
  try {
    const { status, canAskAgain } = await Contacts.requestPermissionsAsync();
    console.log('[Permissions] Contacts:', status, '| canAskAgain:', canAskAgain);
    return mapStatus(status, canAskAgain === false ? false : undefined);
  } catch (err) {
    console.error('[Permissions] Contacts request error:', err);
    return 'denied';
  }
}

// ─── Onboarding Flag ─────────────────────────────────────────────────────────

/**
 * hasCompletedPermissionOnboarding()
 *
 * Checks SharedPreferences equivalent (AsyncStorage) for the flag set after
 * the first-launch permission flow is completed.
 * Equivalent to Flutter SharedPreferences.getBool('has_seen_onboarding').
 */
export async function hasCompletedPermissionOnboarding(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(ONBOARDING_PERMISSION_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * markPermissionOnboardingComplete()
 *
 * Persists the onboarding-complete flag so the flow never shows again.
 * Called at the end of the permission onboarding screen.
 * Equivalent to Flutter SharedPreferences.setBool('has_seen_onboarding', true).
 */
export async function markPermissionOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_PERMISSION_KEY, 'true');
    console.log('[Permissions] Onboarding marked complete.');
  } catch (err) {
    console.error('[Permissions] Failed to mark onboarding complete:', err);
  }
}

// ─── Critical Permission Audit (silent re-check) ──────────────────────────────

/**
 * criticalPermissionsMissing()
 *
 * Called silently on every launch after onboarding is complete.
 * Returns which CRITICAL permissions have been revoked since last launch.
 * Result is shown as a discreet in-app banner — NOT a popup dialog.
 *
 * Critical permissions: microphone + location (required for SOS protocol).
 * Non-critical: notifications, contacts (degrade gracefully).
 */
export async function criticalPermissionsMissing(): Promise<{
  microphone: boolean;
  location: boolean;
}> {
  const perms = await checkPermissions();
  return {
    microphone: perms.microphone !== 'granted',
    location:   perms.location   !== 'granted',
  };
}

// ─── Full Request Flow (for re-triggering from Settings) ─────────────────────

/**
 * requestAllPermissions()
 *
 * Requests all permissions in the correct order.
 * Called during first-launch onboarding (permission_onboarding_screen equivalent).
 * Order: mic → location → notifications → contacts (non-critical last).
 */
export async function requestAllPermissions(): Promise<AppPermissions> {
  const mic    = await requestMicrophonePermission();
  const loc    = await requestLocationPermission();
  const notif  = await requestNotificationPermission();
  const ctcts  = await requestContactsPermission();
  return { microphone: mic, location: loc, notifications: notif, contacts: ctcts };
}

/**
 * isFullyPermissioned()
 *
 * Returns true if all critical permissions are granted.
 * Non-critical (contacts) is excluded from this check.
 */
export function isFullyPermissioned(perms: AppPermissions): boolean {
  return (
    perms.microphone    === 'granted' &&
    perms.location      === 'granted' &&
    perms.notifications === 'granted'
  );
}
