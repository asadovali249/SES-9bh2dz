/**
 * calculator-settings.tsx — Presentation Layer
 *
 * Disguised "Calculator Settings" screen.
 *
 * VISUAL DECEPTION STRATEGY:
 *   Every sensitive setting is given an innocent calculator-centric label:
 *
 *   REAL PURPOSE                  DISPLAYED AS
 *   ─────────────────────────────────────────────────────
 *   Secret SOS trigger PIN    →   "Private Mode PIN"
 *                                 "Lock your calculation history"
 *   Emergency contacts        →   "Quick Contacts"
 *                                 "Send calculations directly"
 *   Microphone permission     →   "Voice Input"
 *                                 "Speak numbers hands-free"
 *   Location permission       →   "Location Tagging"
 *                                 "Tag shared calculations with location"
 *
 * The screen looks identical to a typical iOS calculator companion app settings.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/hooks/useSettings';
import { useAlert } from '@/template';
import { SosContact } from '@/services/emergencyProtocolService';
import {
  requestMicrophonePermission,
  requestLocationPermission,
} from '@/services/permissionService';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '@/constants/theme';

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={sStyles.sectionHeader}>{title}</Text>;
}

// ─── Settings Row ─────────────────────────────────────────────────────────────

function SettingsRow({
  icon,
  label,
  sublabel,
  onPress,
  right,
  iconColor = '#8E8E93',
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  iconColor?: string;
}) {
  const inner = (
    <View style={sStyles.row}>
      <View style={[sStyles.rowIcon, { backgroundColor: iconColor + '22' }]}>
        <MaterialIcons name={icon} size={18} color={iconColor} />
      </View>
      <View style={sStyles.rowText}>
        <Text style={sStyles.rowLabel}>{label}</Text>
        {sublabel ? <Text style={sStyles.rowSublabel}>{sublabel}</Text> : null}
      </View>
      {right}
    </View>
  );

  return onPress ? (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [sStyles.rowPressable, pressed && { opacity: 0.65 }]}
    >
      {inner}
    </Pressable>
  ) : (
    <View style={sStyles.rowPressable}>{inner}</View>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

function Divider() {
  return <View style={sStyles.divider} />;
}

// ─── Contact Card ─────────────────────────────────────────────────────────────

function ContactEditor({
  contact,
  index,
  onChange,
  onRemove,
}: {
  contact: SosContact;
  index: number;
  onChange: (i: number, field: keyof SosContact, value: string) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <View style={sStyles.contactCard}>
      <View style={sStyles.contactCardHeader}>
        <View style={sStyles.contactBadge}>
          <Text style={sStyles.contactBadgeText}>{index + 1}</Text>
        </View>
        <Text style={sStyles.contactCardTitle}>Contact {index + 1}</Text>
        <Pressable
          onPress={() => onRemove(index)}
          hitSlop={10}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
        >
          <MaterialIcons name="remove-circle-outline" size={20} color="#FF453A" />
        </Pressable>
      </View>

      <TextInput
        style={sStyles.contactInput}
        placeholder="Full name"
        placeholderTextColor="#555"
        value={contact.name}
        onChangeText={v => onChange(index, 'name', v)}
        autoCapitalize="words"
      />
      <TextInput
        style={sStyles.contactInput}
        placeholder="Phone number  (e.g. +994501234567)"
        placeholderTextColor="#555"
        value={contact.phone}
        onChangeText={v => onChange(index, 'phone', v)}
        keyboardType="phone-pad"
      />
      <TextInput
        style={sStyles.contactInput}
        placeholder="Relation  (e.g. Mother, Friend)"
        placeholderTextColor="#555"
        value={contact.relation}
        onChangeText={v => onChange(index, 'relation', v)}
        autoCapitalize="words"
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CalculatorSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showAlert } = useAlert();
  const {
    contacts,
    permissions,
    appearance,
    updateContacts,
    updateAppearance,
    refreshPermissions,
    completeOnboarding,
    onboardingDone,
    clearCalculator,
  } = useSettings();

  // Local UI state
  const [editedContacts, setEditedContacts] = useState<SosContact[]>(
    contacts.length > 0
      ? contacts.map(c => ({ ...c }))
      : [{ name: '', phone: '', relation: '' }]
  );
  const [micLoading,  setMicLoading]  = useState(false);
  const [locLoading,  setLocLoading]  = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Sync contacts if context changes (e.g. first load)
  useEffect(() => {
    if (contacts.length > 0) {
      setEditedContacts(contacts.map(c => ({ ...c })));
    }
  }, [contacts]);

  const micGranted = permissions.microphone === 'granted';
  const locGranted = permissions.location === 'granted';
  const allSet = micGranted && locGranted;

  // ── Permission handlers ───────────────────────────────────────────────────

  const handleRequestMic = useCallback(async () => {
    setMicLoading(true);
    const result = await requestMicrophonePermission();
    await refreshPermissions();
    setMicLoading(false);
    if (result === 'denied') {
      showAlert(
        'Microphone Access Denied',
        'Please enable microphone access in your device Settings to use Voice Input.'
      );
    }
  }, [refreshPermissions, showAlert]);

  const handleRequestLocation = useCallback(async () => {
    setLocLoading(true);
    const result = await requestLocationPermission();
    await refreshPermissions();
    setLocLoading(false);
    if (result === 'denied') {
      showAlert(
        'Location Access Denied',
        'Please enable location access in your device Settings to use Location Tagging.'
      );
    }
  }, [refreshPermissions, showAlert]);

  // ── Contact handlers ──────────────────────────────────────────────────────

  const handleContactChange = useCallback(
    (index: number, field: keyof SosContact, value: string) => {
      setEditedContacts(prev => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const handleAddContact = useCallback(() => {
    if (editedContacts.length >= 5) {
      showAlert('Limit Reached', 'Maximum 5 quick contacts allowed.');
      return;
    }
    setEditedContacts(prev => [...prev, { name: '', phone: '', relation: '' }]);
  }, [editedContacts.length, showAlert]);

  const handleRemoveContact = useCallback((index: number) => {
    setEditedContacts(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSaveContacts = useCallback(async () => {
    const valid = editedContacts.filter(c => c.name.trim() && c.phone.trim());
    if (valid.length === 0) {
      showAlert('No Valid Contacts', 'Please add at least one contact with a name and phone number.');
      return;
    }
    setSaveLoading(true);
    await updateContacts(valid);
    if (!onboardingDone) await completeOnboarding();
    setSaveLoading(false);
    showAlert('Saved', 'Your Quick Contacts have been updated.');
  }, [editedContacts, updateContacts, completeOnboarding, onboardingDone, showAlert]);

  // ── Clear History ─────────────────────────────────────────────────────────

  const handleClearHistory = useCallback(() => {
    showAlert(
      'Clear Calculation History',
      'This will reset the current calculation. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearCalculator();
            showAlert('Done', 'Calculation history has been cleared.');
          },
        },
      ]
    );
  }, [clearCalculator, showAlert]);

  // ── Appearance handlers ────────────────────────────────────────────────────

  const handleToggleLargeText = useCallback((val: boolean) => {
    updateAppearance({ largeText: val });
  }, [updateAppearance]);

  const handleToggleHaptics = useCallback((val: boolean) => {
    updateAppearance({ haptics: val });
  }, [updateAppearance]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[sStyles.root, { paddingTop: insets.top }]}>

        {/* ── Header ────────────────────────────────────────────────── */}
        <View style={sStyles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [sStyles.backBtn, pressed && { opacity: 0.6 }]}
          >
            <MaterialIcons name="arrow-back-ios" size={18} color={Colors.textPrimary} />
          </Pressable>
          <Text style={sStyles.headerTitle}>Calculator Settings</Text>
          {allSet ? (
            <View style={sStyles.allSetBadge}>
              <MaterialIcons name="check-circle" size={13} color="#30D158" />
              <Text style={sStyles.allSetText}>All Set</Text>
            </View>
          ) : (
            <View style={sStyles.setupBadge}>
              <MaterialIcons name="info-outline" size={13} color="#FF9F0A" />
              <Text style={sStyles.setupBadgeText}>Setup needed</Text>
            </View>
          )}
        </View>

        <ScrollView
          style={sStyles.scroll}
          contentContainerStyle={[sStyles.scrollContent, { paddingBottom: insets.bottom + 48 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Onboarding banner */}
          {!onboardingDone ? (
            <View style={sStyles.onboardingBanner}>
              <MaterialIcons name="info-outline" size={16} color="#FFD60A" />
              <Text style={sStyles.onboardingText}>
                Complete setup to unlock all Calculator+ features.
              </Text>
            </View>
          ) : null}

          {/* ════════════════════════════════════════════════════════
              SECTION 1 — FEATURES (permissions)
          ════════════════════════════════════════════════════════ */}
          <SectionHeader title="FEATURES" />
          <View style={sStyles.card}>

            {/* Microphone → Voice Input */}
            <SettingsRow
              icon="mic"
              iconColor="#30D158"
              label="Voice Input"
              sublabel={
                micGranted
                  ? 'Enabled — speak numbers hands-free'
                  : 'Tap to enable hands-free number entry'
              }
              onPress={micGranted ? undefined : handleRequestMic}
              right={
                micLoading
                  ? <ActivityIndicator size="small" color="#30D158" />
                  : micGranted
                    ? <MaterialIcons name="check-circle" size={22} color="#30D158" />
                    : (
                      <View style={sStyles.enableBtn}>
                        <Text style={sStyles.enableBtnText}>Enable</Text>
                      </View>
                    )
              }
            />

            <Divider />

            {/* Location → Location Tagging */}
            <SettingsRow
              icon="location-on"
              iconColor="#00C6FF"
              label="Location Tagging"
              sublabel={
                locGranted
                  ? 'Enabled — calculations include your location'
                  : 'Tap to tag shared calculations with location'
              }
              onPress={locGranted ? undefined : handleRequestLocation}
              right={
                locLoading
                  ? <ActivityIndicator size="small" color="#00C6FF" />
                  : locGranted
                    ? <MaterialIcons name="check-circle" size={22} color="#30D158" />
                    : (
                      <View style={[sStyles.enableBtn, sStyles.enableBtnBlue]}>
                        <Text style={[sStyles.enableBtnText, { color: '#00C6FF' }]}>Enable</Text>
                      </View>
                    )
              }
            />
          </View>

          {/* ════════════════════════════════════════════════════════
              SECTION 2 — HISTORY
          ════════════════════════════════════════════════════════ */}
          <SectionHeader title="HISTORY" />
          <View style={sStyles.card}>
            <SettingsRow
              icon="history"
              iconColor="#8E8E93"
              label="Clear History"
              sublabel="Reset the current calculation"
              onPress={handleClearHistory}
              right={<MaterialIcons name="chevron-right" size={20} color={Colors.textSubtle} />}
            />
          </View>

          {/* ════════════════════════════════════════════════════════
              SECTION 3 — QUICK CONTACTS (emergency recipients)
          ════════════════════════════════════════════════════════ */}
          <SectionHeader title="QUICK CONTACTS" />
          <View style={sStyles.contactsIntroRow}>
            <MaterialIcons name="people-outline" size={15} color="#8E8E93" />
            <Text style={sStyles.contactsIntroText}>
              Send calculation results to these contacts instantly.
            </Text>
          </View>

          {editedContacts.map((contact, index) => (
            <ContactEditor
              key={index}
              contact={contact}
              index={index}
              onChange={handleContactChange}
              onRemove={handleRemoveContact}
            />
          ))}

          <Pressable
            style={({ pressed }) => [sStyles.addContactBtn, pressed && { opacity: 0.65 }]}
            onPress={handleAddContact}
          >
            <MaterialIcons name="add-circle-outline" size={20} color="#00C6FF" />
            <Text style={sStyles.addContactText}>Add Contact</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              sStyles.saveContactsBtn,
              pressed && { opacity: 0.8 },
              saveLoading && { opacity: 0.6 },
            ]}
            onPress={handleSaveContacts}
            disabled={saveLoading}
          >
            {saveLoading
              ? <ActivityIndicator size="small" color="#000" />
              : (
                <>
                  <MaterialIcons name="save" size={17} color="#000" />
                  <Text style={sStyles.saveContactsBtnText}>Save Contacts</Text>
                </>
              )}
          </Pressable>

          {/* ════════════════════════════════════════════════════════
              SECTION 4 — APPEARANCE (functional switches)
          ════════════════════════════════════════════════════════ */}
          <SectionHeader title="APPEARANCE" />
          <View style={sStyles.card}>
            <SettingsRow
              icon="brightness-4"
              iconColor="#FFD60A"
              label="Dark Mode"
              sublabel="Always on — matches system theme"
              right={
                <Switch
                  value={true}
                  disabled
                  thumbColor="#fff"
                  trackColor={{ true: '#34C759', false: '#3a3a3c' }}
                />
              }
            />
            <Divider />
            <SettingsRow
              icon="text-fields"
              iconColor="#FF9F0A"
              label="Large Display Text"
              sublabel="Increases the calculator display font size"
              right={
                <Switch
                  value={appearance.largeText}
                  onValueChange={handleToggleLargeText}
                  thumbColor={appearance.largeText ? '#fff' : '#aaa'}
                  trackColor={{ true: '#34C759', false: '#3a3a3c' }}
                />
              }
            />
            <Divider />
            <SettingsRow
              icon="vibration"
              iconColor="#8E8E93"
              label="Haptic Feedback"
              sublabel="Subtle vibration on button press"
              right={
                <Switch
                  value={appearance.haptics}
                  onValueChange={handleToggleHaptics}
                  thumbColor={appearance.haptics ? '#fff' : '#aaa'}
                  trackColor={{ true: '#34C759', false: '#3a3a3c' }}
                />
              }
            />
          </View>

          {/* ── About ────────────────────────────────────────────────── */}
          <SectionHeader title="ABOUT" />
          <View style={sStyles.card}>
            <SettingsRow
              icon="info-outline"
              iconColor="#8E8E93"
              label="Calculator+"
              sublabel="Version 1.0.0 · Build 1 · All features enabled"
            />
            <Divider />
            <SettingsRow
              icon="security"
              iconColor="#30D158"
              label="Privacy Policy"
              sublabel="Your data never leaves this device"
              onPress={() => showAlert('Privacy Policy', 'All settings are stored locally on your device. No data is transmitted to external servers without your explicit action.')}
              right={<MaterialIcons name="chevron-right" size={20} color={Colors.textSubtle} />}
            />
          </View>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111113',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    backgroundColor: '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: Spacing.sm,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  allSetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(48,209,88,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  allSetText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: '#30D158',
  },
  setupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,159,10,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  setupBadgeText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: '#FF9F0A',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.xs,
  },

  // Onboarding banner
  onboardingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,214,10,0.07)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,214,10,0.18)',
  },
  onboardingText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: '#FFD60A',
    lineHeight: 20,
  },

  // Section header
  sectionHeader: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
    color: Colors.textSubtle,
    letterSpacing: 0.8,
    marginTop: Spacing.md,
    marginBottom: 6,
    marginLeft: 4,
  },

  // Card container
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginLeft: 56,
  },

  // Row
  rowPressable: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowIcon: {
    width: 33,
    height: 33,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
  },
  rowSublabel: {
    fontSize: 12,
    color: Colors.textSubtle,
    marginTop: 2,
    lineHeight: 16,
  },

  // Enable button variants
  enableBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(48,209,88,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(48,209,88,0.28)',
  },
  enableBtnBlue: {
    backgroundColor: 'rgba(0,198,255,0.1)',
    borderColor: 'rgba(0,198,255,0.28)',
  },
  enableBtnText: {
    fontSize: 12,
    fontWeight: FontWeight.semibold,
    color: '#30D158',
  },

  // Contacts
  contactsIntroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginLeft: 4,
  },
  contactsIntroText: {
    fontSize: 12,
    color: Colors.textSubtle,
    flex: 1,
  },
  contactCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: Spacing.sm,
  },
  contactCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 2,
  },
  contactBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#00C6FF1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactBadgeText: {
    fontSize: 12,
    fontWeight: FontWeight.bold,
    color: '#00C6FF',
  },
  contactCardTitle: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  contactInput: {
    backgroundColor: '#0A0A0F',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  addContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,198,255,0.28)',
    marginBottom: Spacing.sm,
  },
  addContactText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: '#00C6FF',
  },
  saveContactsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 15,
    borderRadius: BorderRadius.md,
    backgroundColor: '#FF9F0A',
    marginBottom: Spacing.md,
  },
  saveContactsBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: '#000',
  },
});
