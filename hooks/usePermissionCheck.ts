/**
 * usePermissionCheck.ts — Hook Layer
 *
 * Silent background permission audit for every app launch AFTER the
 * first-launch onboarding flow has been completed.
 *
 * Equivalent to Flutter's silent re-check on app resume after
 * has_seen_onboarding is true.
 *
 * BEHAVIOR:
 *   • On mount: silently calls checkPermissions() with no UI prompt.
 *   • If any CRITICAL permission (mic, location) has been revoked
 *     since the last launch, sets `revokedPermissions` so the
 *     caller can render a discreet in-app banner.
 *   • Banner is NOT a popup/alert — it is a thin strip at the top
 *     of the calculator display (invisible to casual observers as
 *     an "alarm" — looks like a status indicator).
 *   • Non-critical revocations (notifications, contacts) are ignored.
 *
 * @sprint 1 — MVP
 */

import { useState, useEffect, useCallback } from 'react';
import {
  criticalPermissionsMissing,
  openAppSettings,
  hasCompletedPermissionOnboarding,
} from '@/services/permissionService';

export interface RevokedPermissions {
  microphone: boolean;
  location:   boolean;
}

export interface UsePermissionCheckResult {
  /** True if any critical permission has been revoked after onboarding */
  hasRevokedPermissions: boolean;
  /** Which specific permissions are currently missing */
  revokedPermissions: RevokedPermissions;
  /** Recheck (call after user returns from Settings) */
  recheck: () => Promise<void>;
  /** Open system Settings → app permissions page */
  goToSettings: () => Promise<void>;
  /** Dismiss the banner without fixing (user choice) */
  dismissBanner: () => void;
  /** Whether the banner has been manually dismissed this session */
  bannerDismissed: boolean;
}

export function usePermissionCheck(): UsePermissionCheckResult {
  const [revokedPermissions, setRevokedPermissions] = useState<RevokedPermissions>({
    microphone: false,
    location:   false,
  });
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const performCheck = useCallback(async () => {
    // Only run after first-launch onboarding is complete
    const onboardingDone = await hasCompletedPermissionOnboarding();
    if (!onboardingDone) return;

    const missing = await criticalPermissionsMissing();
    setRevokedPermissions(missing);
  }, []);

  // Run on mount (every app launch)
  useEffect(() => {
    performCheck();
  }, [performCheck]);

  const recheck = useCallback(async () => {
    setBannerDismissed(false);
    await performCheck();
  }, [performCheck]);

  const goToSettings = useCallback(async () => {
    await openAppSettings();
    // Recheck after returning from Settings (AppState handles this upstream,
    // but we provide a manual trigger for the banner's "Open Settings" button)
  }, []);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
  }, []);

  const hasRevokedPermissions =
    !bannerDismissed && (revokedPermissions.microphone || revokedPermissions.location);

  return {
    hasRevokedPermissions,
    revokedPermissions,
    recheck,
    goToSettings,
    dismissBanner,
    bannerDismissed,
  };
}
