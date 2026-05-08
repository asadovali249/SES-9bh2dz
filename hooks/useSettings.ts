/**
 * useSettings.ts — Hook Layer (Domain Layer)
 *
 * Consumer hook for SettingsContext.
 * Components import from here — never from contexts/ directly.
 */

import { useContext } from 'react';
import { SettingsContext } from '@/contexts/SettingsContext';

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}
