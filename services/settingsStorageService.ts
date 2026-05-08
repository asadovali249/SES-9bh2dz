/**
 * settingsStorageService.ts — Data Layer
 *
 * Persists all user-configured settings to AsyncStorage.
 * Data stored:
 *   - Secret PIN (plain; Sprint 2: bcrypt hash in SecureStore)
 *   - Emergency contacts (disguised as "Quick Contacts")
 *   - Onboarding completion flag
 *   - Appearance preferences (dark mode, large text, haptics)
 *
 * Security Note for Sprint 2:
 *   Replace AsyncStorage with expo-secure-store for PIN storage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SosContact } from './emergencyProtocolService';

export const KEYS = {
  PIN: '@ses_pin',
  CONTACTS: '@ses_contacts',
  ONBOARDING_DONE: '@ses_onboarding_done',
  APPEARANCE_LARGE_TEXT: '@ses_large_text',
  APPEARANCE_HAPTICS: '@ses_haptics',
} as const;

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_CONTACTS: SosContact[] = [
  { name: '', phone: '', relation: '' },
];

export interface AppearanceSettings {
  largeText: boolean;
  haptics: boolean;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  largeText: true,
  haptics: true,
};

// ─── PIN ──────────────────────────────────────────────────────────────────────

export async function savePin(pin: string): Promise<void> {
  // Sprint 2: await SecureStore.setItemAsync(KEYS.PIN, pin);
  await AsyncStorage.setItem(KEYS.PIN, pin);
}

export async function loadPin(): Promise<string> {
  const pin = await AsyncStorage.getItem(KEYS.PIN);
  return pin ?? '9999';
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export async function saveContacts(contacts: SosContact[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.CONTACTS, JSON.stringify(contacts));
}

export async function loadContacts(): Promise<SosContact[]> {
  const raw = await AsyncStorage.getItem(KEYS.CONTACTS);
  if (!raw) return DEFAULT_CONTACTS;
  try {
    return JSON.parse(raw) as SosContact[];
  } catch {
    return DEFAULT_CONTACTS;
  }
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

export async function markOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(KEYS.ONBOARDING_DONE, 'true');
}

export async function isOnboardingComplete(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.ONBOARDING_DONE);
  return val === 'true';
}

// ─── Appearance ───────────────────────────────────────────────────────────────

export async function saveAppearance(settings: AppearanceSettings): Promise<void> {
  await AsyncStorage.multiSet([
    [KEYS.APPEARANCE_LARGE_TEXT, settings.largeText ? 'true' : 'false'],
    [KEYS.APPEARANCE_HAPTICS, settings.haptics ? 'true' : 'false'],
  ]);
}

export async function loadAppearance(): Promise<AppearanceSettings> {
  const results = await AsyncStorage.multiGet([
    KEYS.APPEARANCE_LARGE_TEXT,
    KEYS.APPEARANCE_HAPTICS,
  ]);
  const map = Object.fromEntries(results.map(([k, v]) => [k, v]));
  return {
    largeText: map[KEYS.APPEARANCE_LARGE_TEXT] !== 'false',
    haptics: map[KEYS.APPEARANCE_HAPTICS] !== 'false',
  };
}

// ─── Reset (dev only) ─────────────────────────────────────────────────────────

export async function resetAllSettings(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}
