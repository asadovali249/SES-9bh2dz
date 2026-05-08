/**
 * SettingsContext.tsx — Global State (Contexts Layer)
 *
 * Provides app-wide access to:
 *   - The user-configured SOS PIN
 *   - Emergency contact list
 *   - Device permission status
 *   - Onboarding completion flag
 *   - Appearance preferences (large text, haptics)
 *   - clearCalculator callback (for "Clear History" in settings)
 */

import React, {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { SosContact } from '@/services/emergencyProtocolService';
import { AppPermissions, checkPermissions } from '@/services/permissionService';
import {
  loadPin,
  loadContacts,
  isOnboardingComplete,
  savePin,
  saveContacts,
  markOnboardingComplete,
  loadAppearance,
  saveAppearance,
  AppearanceSettings,
  DEFAULT_APPEARANCE,
} from '@/services/settingsStorageService';
import { SOS_CONFIG } from '@/constants/config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SettingsContextType {
  // State
  isLoading: boolean;
  onboardingDone: boolean;
  pin: string;
  contacts: SosContact[];
  permissions: AppPermissions;
  appearance: AppearanceSettings;

  // Actions
  updatePin: (newPin: string) => Promise<void>;
  updateContacts: (contacts: SosContact[]) => Promise<void>;
  updateAppearance: (settings: Partial<AppearanceSettings>) => Promise<void>;
  refreshPermissions: () => Promise<void>;
  completeOnboarding: () => Promise<void>;

  // Calculator clear trigger — registered by useSosController
  registerClearCalculator: (fn: () => void) => void;
  clearCalculator: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [pin, setPin] = useState(SOS_CONFIG.TRIGGER_PIN);
  const [contacts, setContacts] = useState<SosContact[]>(SOS_CONFIG.EMERGENCY_CONTACTS);
  const [permissions, setPermissions] = useState<AppPermissions>({
    microphone: 'undetermined',
    location: 'undetermined',
  });
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);

  // Ref for clear calculator callback — avoids re-render loops
  const clearCalculatorRef = useRef<(() => void) | null>(null);

  // Load persisted settings on mount
  useEffect(() => {
    (async () => {
      try {
        const [savedPin, savedContacts, onboardingStatus, perms, savedAppearance] =
          await Promise.all([
            loadPin(),
            loadContacts(),
            isOnboardingComplete(),
            checkPermissions(),
            loadAppearance(),
          ]);

        setPin(savedPin);
        const validContacts = savedContacts.filter(c => c.name && c.phone);
        setContacts(validContacts.length > 0 ? validContacts : SOS_CONFIG.EMERGENCY_CONTACTS);
        setOnboardingDone(onboardingStatus);
        setPermissions(perms);
        setAppearance(savedAppearance);
      } catch (err) {
        console.error('[SettingsContext] Load error:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const updatePin = useCallback(async (newPin: string) => {
    await savePin(newPin);
    setPin(newPin);
  }, []);

  const updateContacts = useCallback(async (newContacts: SosContact[]) => {
    await saveContacts(newContacts);
    setContacts(newContacts);
  }, []);

  const updateAppearance = useCallback(async (partial: Partial<AppearanceSettings>) => {
    setAppearance(prev => {
      const next = { ...prev, ...partial };
      saveAppearance(next); // fire-and-forget persist
      return next;
    });
  }, []);

  const refreshPermissions = useCallback(async () => {
    const perms = await checkPermissions();
    setPermissions(perms);
  }, []);

  const completeOnboarding = useCallback(async () => {
    await markOnboardingComplete();
    setOnboardingDone(true);
  }, []);

  const registerClearCalculator = useCallback((fn: () => void) => {
    clearCalculatorRef.current = fn;
  }, []);

  const clearCalculator = useCallback(() => {
    clearCalculatorRef.current?.();
  }, []);

  return (
    <SettingsContext.Provider value={{
      isLoading,
      onboardingDone,
      pin,
      contacts,
      permissions,
      appearance,
      updatePin,
      updateContacts,
      updateAppearance,
      refreshPermissions,
      completeOnboarding,
      registerClearCalculator,
      clearCalculator,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}
