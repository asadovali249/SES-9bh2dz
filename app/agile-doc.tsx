/**
 * Agile Documentation Screen
 * 
 * Presents the full Sprint 1 Agile Blueprint for academic evaluation.
 * Accessible via the hidden corner dot on the calculator screen.
 * 
 * Contains all 5 sections:
 *   1. Agile Artifacts & Planning
 *   2. Risk Management & Spikes
 *   3. System Architecture & Data Flow
 *   4. Firestore NoSQL Schema
 *   5. Core Implementation Notes
 */

import React, { useState } from 'react';
import {
  StyleSheet, View, Text, ScrollView, Pressable,
  StatusBar, SafeAreaView
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '@/constants/theme';

// ─── Data ──────────────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: 'artifacts',
    icon: 'flag' as const,
    title: '1. Agile Artifacts & Planning',
    color: '#00C6FF',
    content: [
      {
        heading: 'Product Vision Statement',
        body: `FOR individuals living under the threat of domestic violence,\nWHO need immediate, covert emergency assistance,\nTHE SƏS (Səssiz Yardım Sistemi) application\nIS A silent safety platform\nTHAT instantly alerts trusted contacts with live GPS coordinates and ambient audio evidence WITHOUT revealing its true purpose to the abuser.\nUNLIKE generic emergency dial shortcuts,\nOUR PRODUCT maintains absolute visual deception through a fully functional calculator interface, ensuring victim safety throughout the alert process.`,
      },
      {
        heading: 'Definition of Ready (DoR)',
        body: `A User Story is READY for Sprint when:\n✓ Acceptance criteria written in BDD (Given/When/Then) format\n✓ All hardware permissions identified (GPS, Microphone, SMS)\n✓ Security threat model reviewed by team\n✓ Spike completed for any novel technology risk\n✓ Story points estimated via Planning Poker\n✓ No external blocking dependencies\n✓ UI mockup reviewed and approved\n✓ Privacy impact assessment noted`,
      },
      {
        heading: 'Definition of Done (DoD)',
        body: `A User Story is DONE when:\n✓ All BDD acceptance criteria pass (automated or manual)\n✓ Code reviewed by ≥1 peer (PR approved)\n✓ No critical/high security vulnerabilities (OWASP checklist)\n✓ Unit test coverage ≥80% for service layer\n✓ Permission failure paths tested on real device\n✓ No PII logged in plaintext\n✓ Feature tested on iOS 15+ and Android API 29+\n✓ Product Owner accepts the story in Sprint Review`,
      },
      {
        heading: 'Epic: Covert SOS Trigger System',
        body: `Epic Goal: A user in danger can activate an emergency response within 3 seconds, using only a calculator input sequence, without the abuser detecting any unusual phone behavior.`,
      },
      {
        heading: 'US-01: Decoy Calculator Interface',
        body: `As a victim in a dangerous situation,\nI want the app to look and function exactly like a standard calculator,\nSo that an abuser inspecting my phone cannot detect the app's true purpose.\n\n📋 Acceptance Criteria (BDD):\n\nGIVEN the app is launched\nWHEN the user views the home screen\nTHEN only a functional calculator UI is visible with no SOS indicators\n\nGIVEN the user enters "2 + 2 ="\nWHEN the equals button is pressed\nTHEN the display correctly shows "4" with no side effects\n\nGIVEN the user enters any non-trigger PIN\nWHEN equals is pressed\nTHEN the display shows the mathematical result and no SOS state is entered`,
      },
      {
        heading: 'US-02: Secret PIN Trigger Mechanism',
        body: `As a victim needing to summon help covertly,\nI want to type a secret PIN (9999=) on the calculator,\nSo that the SOS protocol activates silently without UI change.\n\n📋 Acceptance Criteria (BDD):\n\nGIVEN the user types "9999" on the calculator\nWHEN the "=" button is pressed\nTHEN the display shows "9999" (plausible) AND the SOS protocol begins in background\n\nGIVEN the SOS protocol has been triggered\nWHEN the abuser looks at the screen\nTHEN the calculator UI is unchanged and shows no alerts or loading states\n\nGIVEN the SOS trigger activates\nWHEN triggered multiple times in 60 seconds\nTHEN the protocol executes only once (idempotency guard)`,
      },
      {
        heading: 'US-03: GPS Location Acquisition',
        body: `As an emergency contact receiving an SOS,\nI want to receive the victim's precise GPS coordinates,\nSo that I can locate and assist them immediately.\n\n📋 Acceptance Criteria (BDD):\n\nGIVEN the SOS protocol is active\nWHEN GPS signal is available\nTHEN coordinates with accuracy ≤50m are captured within 5 seconds\n\nGIVEN GPS permission was denied or signal unavailable\nWHEN the SMS is dispatched\nTHEN the message clearly states "GPS unavailable" rather than sending null data\n\nGIVEN location is captured\nWHEN included in the SOS SMS\nTHEN a Google Maps deep link to the coordinates is included`,
      },
      {
        heading: 'US-04: Ambient Audio Recording & SMS Dispatch',
        body: `As a victim's emergency contact,\nI want to receive an SMS alert with an audio recording link,\nSo that I have evidence and situational awareness.\n\n📋 Acceptance Criteria (BDD):\n\nGIVEN the SOS protocol activates\nWHEN microphone permission is granted\nTHEN a 30-second ambient audio file begins recording immediately\n\nGIVEN audio recording completes\nWHEN uploaded to cloud storage\nTHEN a secure, time-limited download link is included in the SMS\n\nGIVEN all contacts defined in the user's profile\nWHEN SMS dispatch is called\nTHEN all contacts receive the SMS within 30 seconds of trigger`,
      },
    ],
  },
  {
    id: 'risks',
    icon: 'warning' as const,
    title: '2. Risk Management & Spikes',
    color: '#FF6B35',
    content: [
      {
        heading: 'Risk #1: iOS/Android Background Execution Limits',
        body: `Probability: HIGH | Impact: CRITICAL\n\nProblem: iOS aggressively suspends background apps after 30 seconds. If the phone is locked immediately after trigger, GPS and audio may be killed before completion.\n\n⚡ SPIKE (2-day time-box):\nInvestigate: expo-task-manager + Background Fetch API, iOS UIBackgroundModes configuration (location, audio, fetch), Android WorkManager persistent tasks.\n\nMitigation Strategy:\n• Start AVAudioSession in .record category BEFORE app backgrounds\n• Request Background Location permission during onboarding\n• Use a silent push notification to keep app alive (Firebase FCM)\n• Implement foreground service on Android with a non-intrusive notification`,
      },
      {
        heading: 'Risk #2: Permission Denial at Trigger Time',
        body: `Probability: MEDIUM | Impact: HIGH\n\nProblem: If the victim never granted microphone/location permissions, the SOS trigger will silently fail — the most dangerous failure mode possible.\n\n⚡ SPIKE (1-day time-box):\nTest permission flows: What happens on first app launch? Can permissions be requested without UI during SOS? Document platform differences.\n\nMitigation Strategy:\n• Implement a disguised "Calculator Settings" onboarding flow that requests all permissions upfront\n• Show permission status in hidden Agile Doc screen (developer view)\n• If permission denied at trigger: SMS dispatches with "Evidence capture failed" message — the alert still goes through\n• Graceful degradation: GPS-only → SMS-only → queued for retry`,
      },
      {
        heading: 'Risk #3: SMS Delivery Without User Confirmation Dialog',
        body: `Probability: HIGH | Impact: CRITICAL\n\nProblem: On iOS, react-native-sms requires the user to press "Send" in a system dialog — destroying the covert nature of the feature.\n\n⚡ SPIKE (3-day time-box):\nEvaluate: Twilio REST API via Firebase Cloud Function, direct HTTP calls from device, server-side SMS queuing.\n\nMitigation Strategy (Sprint 2):\n• Route all SMS through Twilio REST API called from Firebase Cloud Functions\n• Device sends a lightweight trigger payload to Cloud Function via HTTPS\n• Cloud Function authenticates request + dispatches SMS — no system dialog required\n• MVP (Sprint 1): Mock SMS dispatch with console logging of full payload`,
      },
    ],
  },
  {
    id: 'architecture',
    icon: 'account-tree' as const,
    title: '3. System Architecture & Data Flow',
    color: '#30D158',
    content: [
      {
        heading: 'Clean Architecture — Folder Structure',
        body: `ses_app/\n├── app/                      # Expo Router (Presentation)\n│   ├── _layout.tsx           # Root layout + providers\n│   ├── index.tsx             # calculator_screen\n│   └── agile-doc.tsx         # This documentation screen\n│\n├── components/               # Reusable UI (Presentation)\n│   ├── feature/\n│   │   ├── CalculatorButton.tsx\n│   │   ├── CalculatorDisplay.tsx\n│   │   └── SosStatusOverlay.tsx\n│   └── ui/\n│\n├── hooks/                    # Domain Layer\n│   └── useSosController.ts   # sos_state_controller\n│                             # State machine + PIN detection\n│\n├── services/                 # Data Layer\n│   └── emergencyProtocolService.ts\n│       # fetchLocation()\n│       # startAudioRecord()\n│       # dispatchSMS()\n│       # executeSosProtocol() — orchestrator\n│\n├── contexts/                 # Cross-cutting state\n│   └── (AuthContext — Sprint 2)\n│\n└── constants/\n    ├── theme.ts              # Design tokens\n    └── config.ts             # SOS_CONFIG, PIN`,
      },
      {
        heading: 'Async Data Flow — PIN to SMS',
        body: `STEP 1: User presses "=" (handleEquals fired)\n↓\nSTEP 2: PIN detection — inputBuffer === "9999"?\n  YES → activateSosProtocol() called asynchronously\n  NO  → standard math evaluation\n↓\nSTEP 3: Calculator display updates REGARDLESS (decoy maintained)\n↓\nSTEP 4: SOS state transitions DECOY → TRIGGERING → ACTIVE\n  (UI never reflects this transition)\n↓\nSTEP 5: executeSosProtocol() begins:\n  PARALLEL: fetchLocation() + startAudioRecord()\n  ↓ (both resolve/reject)\nSTEP 6: dispatchSMS() called with location payload\n  → Builds SMS string with Google Maps link\n  → Iterates contacts, sends each via Twilio (mocked Sprint 1)\n↓\nSTEP 7: uploadAudioToStorage() — fire-and-forget\n  → Does NOT block SMS or completion\n↓\nSTEP 8: SosSessionLog written to Firestore (Sprint 2)\n  → document in SOS_Logs/{sessionId}\n↓\nSTEP 9: State → COMPLETED\n  Total elapsed time target: < 15 seconds`,
      },
      {
        heading: 'State Machine Diagram',
        body: `         ┌─────────────┐\n         │    DECOY    │  ← App appears as calculator\n         └──────┬──────┘\n                │ PIN detected (9999=)\n         ┌──────▼──────┐\n         │ TRIGGERING  │  ← Transition (< 100ms)\n         └──────┬──────┘\n                │ protocol starts\n         ┌──────▼──────┐\n         │   ACTIVE    │  ← GPS+Audio+SMS in progress\n         └──────┬──────┘\n          ┌─────┴─────┐\n   ┌──────▼──┐   ┌────▼────┐\n   │COMPLETED│   │  ERROR  │\n   └─────────┘   └─────────┘`,
      },
    ],
  },
  {
    id: 'schema',
    icon: 'storage' as const,
    title: '4. Firestore NoSQL Schema',
    color: '#FFD60A',
    content: [
      {
        heading: 'Users Collection',
        body: `// Firestore path: users/{userId}\n{\n  "userId": "firebase_auth_uid_abc123",\n  "displayName": "Günel H.",\n  "email": "gunel@example.com",       // hashed in production\n  "pinHash": "bcrypt($2a$12$...)",    // NEVER store plain PIN\n  "createdAt": Timestamp,\n  "lastActive": Timestamp,\n  "sosEnabled": true,\n  "onboardingComplete": true,\n  "deviceInfo": {\n    "platform": "ios",\n    "osVersion": "17.1",\n    "pushToken": "ExponentPushToken[...]"\n  }\n}`,
      },
      {
        heading: 'Contacts Sub-collection',
        body: `// Path: users/{userId}/contacts/{contactId}\n{\n  "contactId": "auto_generated_id",\n  "name": "Ana",\n  "phone": "+994501234567",\n  "relation": "Mother",\n  "isPrimary": true,\n  "smsEnabled": true,\n  "callEnabled": false,\n  "addedAt": Timestamp,\n  "lastNotified": Timestamp | null\n}`,
      },
      {
        heading: 'SOS_Logs Collection',
        body: `// Path: sos_logs/{sessionId}\n// Note: Stored at root level (not under user) for\n// law enforcement subpoena access without full user exposure\n{\n  "sessionId": "SOS-1718234567890-AB3K9F",\n  "userId": "firebase_auth_uid_abc123",  // reference only\n  "triggeredAt": Timestamp,\n  "completedAt": Timestamp | null,\n  "status": "completed",  // in_progress | completed | failed\n\n  "location": {\n    "latitude": 40.377742,\n    "longitude": 49.852034,\n    "accuracy": 12.5,\n    "capturedAt": Timestamp,\n    "mapsUrl": "https://maps.google.com/?q=40.377742,49.852034"\n  },\n\n  "audio": {\n    "storageRef": "sos_audio/uid_abc123/SOS-1718234567890-AB3K9F.m4a",\n    "downloadUrl": "https://storage.googleapis.com/...",\n    "durationMs": 30000,\n    "uploadedAt": Timestamp,\n    "status": "uploaded"  // recording | uploaded | failed\n  },\n\n  "smsDispatches": [\n    {\n      "contactPhone": "+994501234567",\n      "contactName": "Ana",\n      "twilioSid": "SM_twilio_message_sid",\n      "status": "delivered",  // queued | sent | delivered | failed\n      "sentAt": Timestamp\n    }\n  ],\n\n  "metadata": {\n    "appVersion": "1.0.0",\n    "platform": "ios",\n    "triggerMethod": "PIN_9999",\n    "protocolVersion": "v1"\n  }\n}`,
      },
      {
        heading: 'Firebase Security Rules',
        body: `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n\n    // Users: only owner can read/write\n    match /users/{userId} {\n      allow read, write: if request.auth != null\n        && request.auth.uid == userId;\n\n      // Contacts: same user scope\n      match /contacts/{contactId} {\n        allow read, write: if request.auth != null\n          && request.auth.uid == userId;\n      }\n    }\n\n    // SOS Logs: user can create, CANNOT delete\n    // (evidence preservation — critical for legal proceedings)\n    match /sos_logs/{sessionId} {\n      allow create: if request.auth != null\n        && request.resource.data.userId == request.auth.uid;\n      allow read: if request.auth != null\n        && resource.data.userId == request.auth.uid;\n      allow update: if request.auth != null\n        && resource.data.userId == request.auth.uid\n        && !request.resource.data.diff(resource.data).affectedKeys()\n             .hasAny(['userId', 'triggeredAt', 'sessionId']);\n      allow delete: if false; // NO deletions ever\n    }\n  }\n}`,
      },
    ],
  },
  {
    id: 'implementation',
    icon: 'code' as const,
    title: '5. Implementation Notes',
    color: '#BF5AF2',
    content: [
      {
        heading: 'Technology Stack (Production Target)',
        body: `Layer         | Technology\n──────────────────────────────────────\nFrontend      | React Native + Expo SDK 51\nState Mgmt    | Custom Hooks + Context API\n              | (Riverpod equivalent architecture)\nBackend/BaaS  | Firebase (Firestore, Storage, Auth)\nSMS Gateway   | Twilio REST API\nBackground    | expo-task-manager + Background Fetch\nGPS           | expo-location (foreground + background)\nAudio         | expo-av (AVAudioSession recording)\nAuth          | Firebase Authentication (Email + Anon)\nCI/CD         | GitHub Actions + EAS Build\nMonitoring    | Firebase Crashlytics`,
      },
      {
        heading: 'Sprint 1 vs Sprint 2 Boundary',
        body: `SPRINT 1 (MVP — Current Build):\n✅ Decoy calculator — fully functional\n✅ PIN trigger state machine (9999=)\n✅ SOS protocol orchestration\n✅ Mocked GPS with realistic latency simulation\n✅ Mocked audio recording (30s simulation)\n✅ Mocked SMS dispatch with contact iteration\n✅ Session logging architecture\n✅ Clean Architecture separation (Services/Hooks/Components)\n✅ Error handling for all permission paths\n\nSPRINT 2 (Real Hardware Integration):\n⬜ expo-location real GPS (foreground + background)\n⬜ expo-av real microphone recording\n⬜ Twilio SMS via Firebase Cloud Function\n⬜ Firebase Cloud Storage audio upload\n⬜ Firebase Authentication\n⬜ Firestore SOS_Logs write\n⬜ Onboarding flow with permission requests\n⬜ PIN customization (SecureStore encrypted)`,
      },
      {
        heading: 'Scrum Ceremony Notes',
        body: `Sprint Duration: 2 weeks\nTeam Size: 3 developers + 1 PO\n\nSprint 1 Velocity: 21 story points\n  US-01 Calculator UI:     5 pts\n  US-02 PIN Trigger:       8 pts\n  US-03 GPS Acquisition:   5 pts\n  US-04 Audio + SMS:       8 pts (partial — mock)\n\nKey Sprint Events:\n• Sprint Planning: Risk-first ordering (Spike → US-02 first)\n• Daily Standup: 15min, async Slack format\n• Sprint Review: Demo on physical device (not simulator)\n• Retrospective: 60min, team action items tracked\n\nProduct Backlog (future sprints):\n• User authentication + onboarding\n• PIN change / biometric unlock\n• Shake gesture as alternative trigger\n• Periodic check-in (I'm Safe / Need Help)\n• Offline SMS queue with retry\n• Multi-language support (Azerbaijani, Russian, English)`,
      },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgileDocScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [expandedSection, setExpandedSection] = useState<string | null>('artifacts');

  const toggleSection = (id: string) => {
    setExpandedSection(prev => prev === id ? null : id);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialIcons name="arrow-back-ios" size={18} color="#00C6FF" />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>SƏS — Sprint 1 Blueprint</Text>
          <Text style={styles.headerSub}>Agile & Technical Documentation</Text>
        </View>
        <View style={styles.sprintBadge}>
          <Text style={styles.sprintText}>S1 MVP</Text>
        </View>
      </View>

      {/* Vision Banner */}
      <View style={styles.visionBanner}>
        <MaterialIcons name="shield" size={18} color="#00C6FF" />
        <Text style={styles.visionText}>
          Covert Emergency Response Platform — Domestic Safety
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {SECTIONS.map(section => (
          <View key={section.id} style={styles.sectionCard}>
            {/* Section Header */}
            <Pressable
              style={styles.sectionHeader}
              onPress={() => toggleSection(section.id)}
            >
              <View style={[styles.sectionIconWrap, { backgroundColor: section.color + '20' }]}>
                <MaterialIcons name={section.icon} size={20} color={section.color} />
              </View>
              <Text style={[styles.sectionTitle, { color: section.color }]}>
                {section.title}
              </Text>
              <MaterialIcons
                name={expandedSection === section.id ? 'expand-less' : 'expand-more'}
                size={22}
                color={Colors.textSubtle}
              />
            </Pressable>

            {/* Section Content */}
            {expandedSection === section.id ? (
              <View style={styles.sectionContent}>
                {section.content.map((item, idx) => (
                  <View key={idx} style={styles.contentBlock}>
                    <View style={[styles.contentAccent, { backgroundColor: section.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.contentHeading, { color: section.color }]}>
                        {item.heading}
                      </Text>
                      <Text style={styles.contentBody}>{item.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>SƏS v1.0.0 · Sprint 1 MVP · React Native + Expo</Text>
          <Text style={styles.footerText}>University Capstone Project — Agile & Scrum</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,198,255,0.12)',
    gap: Spacing.sm,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: Colors.textSubtle,
    marginTop: 1,
  },
  sprintBadge: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(0,198,255,0.15)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,198,255,0.3)',
  },
  sprintText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: '#00C6FF',
    letterSpacing: 0.5,
  },
  visionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(0,198,255,0.06)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,198,255,0.08)',
  },
  visionText: {
    fontSize: FontSize.sm,
    color: '#00C6FF',
    fontStyle: 'italic',
    flex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sectionCard: {
    backgroundColor: '#13131A',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  sectionContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  contentBlock: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingTop: Spacing.md,
  },
  contentAccent: {
    width: 3,
    borderRadius: 2,
    minHeight: 20,
  },
  contentHeading: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.xs,
  },
  contentBody: {
    fontSize: 12,
    color: '#C0C0C8',
    lineHeight: 20,
    fontFamily: 'monospace',
  },
  footer: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    gap: 4,
  },
  footerText: {
    fontSize: 11,
    color: Colors.textSubtle,
    textAlign: 'center',
  },
});
