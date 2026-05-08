/**
 * Root Layout — SƏS Application
 *
 * AlertProvider is mandatory as outermost wrapper.
 * SafeAreaProvider handles notch/status bar on all devices.
 *
 * First-launch gate:
 *   On app start, checks AsyncStorage for the permission onboarding flag.
 *   If not set → redirects to /permission-onboarding BEFORE the calculator.
 *   If set     → loads calculator directly (silent re-check runs in app/index.tsx).
 *
 * Equivalent to Flutter main.dart:
 *   final hasSeenOnboarding = prefs.getBool('has_seen_onboarding') ?? false;
 *   runApp(hasSeenOnboarding ? CalculatorScreen() : PermissionOnboardingScreen());
 */

import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator } from 'react-native';
import { AlertProvider } from '@/template';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { hasCompletedPermissionOnboarding } from '@/services/permissionService';

// ─── Inner Navigator with onboarding gate ────────────────────────────────────

function RootNavigator() {
  const router   = useRouter();
  const segments = useSegments();

  /**
   * 'loading'   = AsyncStorage check in progress (show splash)
   * 'onboarding' = flag not set → must show permission onboarding
   * 'app'       = flag set → normal calculator experience
   */
  const [authState, setAuthState] = useState<'loading' | 'onboarding' | 'app'>('loading');

  useEffect(() => {
    (async () => {
      const done = await hasCompletedPermissionOnboarding();
      setAuthState(done ? 'app' : 'onboarding');
    })();
  }, []);

  useEffect(() => {
    if (authState === 'loading') return;

    const inOnboarding = segments[0] === 'permission-onboarding';

    if (authState === 'onboarding' && !inOnboarding) {
      // Redirect to permission onboarding — replaces history so back button
      // does not return to an unguarded screen
      router.replace('/permission-onboarding');
    } else if (authState === 'app' && inOnboarding) {
      // Onboarding was just completed — go to calculator
      router.replace('/');
    }
  }, [authState, segments, router]);

  if (authState === 'loading') {
    // Minimal splash while AsyncStorage check runs
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0F', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#0A84FF" size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="permission-onboarding" />
      <Stack.Screen
        name="agile-doc"
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="calculator-settings"
        options={{ headerShown: false, presentation: 'modal' }}
      />
    </Stack>
  );
}

// ─── Root Layout ──────────────────────────────────────────────────────────────

export default function RootLayout() {
  return (
    <AlertProvider>
      <SettingsProvider>
        <SafeAreaProvider>
          <RootNavigator />
        </SafeAreaProvider>
      </SettingsProvider>
    </AlertProvider>
  );
}
