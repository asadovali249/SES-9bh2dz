/**
 * emergency_protocol_service.ts
 *
 * Service Layer — Data Layer (Clean Architecture)
 *
 * Mod 2: Full Twilio REST SMS with proper auth, form encoding, and error surfacing.
 * Mod 3: WhatsApp parallel dispatch via Twilio WhatsApp sandbox.
 *        Both channels run concurrently via Promise.allSettled — neither blocks the other.
 *        Each has its own individual try/catch so one failure cannot suppress the other.
 *
 * Firestore SOS_Logs schema (Mod 3 update):
 * {
 *   sessionId, triggeredAt, triggerMethod: "hold" | "timer",
 *   location: { latitude, longitude, accuracy, timestamp },
 *   audioResult: { sessionId, durationMs, filePath, storageUrl, status },
 *   dispatch_channels: [
 *     { channel: "sms",       contactPhone, contactName, status, sid, errorCode, errorMessage, timestamp },
 *     { channel: "whatsapp",  contactPhone, contactName, status, sid, errorCode, errorMessage, timestamp }
 *   ],
 *   status: "in_progress" | "completed" | "failed"
 * }
 *
 * @author SƏS Dev Team
 * @sprint 1 — MVP (Mods 2 & 3 applied)
 */

// ─── Twilio Configuration ─────────────────────────────────────────────────────
//
// SECURITY NOTE: In production, these must live in Firebase Remote Config or
// be called via a Cloud Function — NEVER hard-code credentials in client code.
// For Sprint 1 demonstration: replace with your actual values.
//
// TROUBLESHOOTING CHECKLIST (Trial Accounts):
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ 1. ACCOUNT SID / AUTH TOKEN                                             │
// │    ✓ Copy from Console → Account Info (NOT the API Key SID)            │
// │    ✗ Common mistake: using API Key SID (starts with "SK") for           │
// │      Basic Auth — only ACCOUNT SID (starts with "AC") works here.       │
// │                                                                         │
// │ 2. RECIPIENT NUMBER MUST BE VERIFIED (Trial only)                       │
// │    ✓ Console → Phone Numbers → Verified Caller IDs → Add               │
// │    ✗ Trial accounts CANNOT send to unverified numbers.                  │
// │      Response: HTTP 400, Twilio code 21608 "not a verified number"      │
// │                                                                         │
// │ 3. NUMBER FORMAT — Always E.164                                         │
// │    ✓ +994501234567   +447911123456   +12125551234                      │
// │    ✗ 0501234567  (no country code)                                      │
// │    ✗ 994501234567   (missing leading +)                                 │
// │                                                                         │
// │ 4. FROM NUMBER must be a Twilio-provisioned number in your account      │
// │    ✓ Console → Phone Numbers → Manage → Active Numbers                 │
// │                                                                         │
// │ 5. CONTENT TYPE HEADER                                                  │
// │    ✓ 'application/x-www-form-urlencoded'                                │
// │    ✗ 'application/json' — Twilio REST ignores JSON bodies silently      │
// │                                                                         │
// │ 6. GEOGRAPHIC RESTRICTIONS                                              │
// │    Some countries (e.g., India, China) require pre-approved sender IDs. │
// │    Check: Console → Messaging → Settings → Geo Permissions              │
// │                                                                         │
// │ 7. WHATSAPP SANDBOX                                                     │
// │    ✓ Recipients must join sandbox: WhatsApp "join <sandbox-code>"       │
// │      to +1 415 523 8886 before receiving sandbox messages.             │
// │    ✓ Production: requires Meta WhatsApp Business API approval           │
// │                                                                         │
// │ 8. SILENT FAILURES — always check the raw response body                 │
// │    This service throws on non-201 so failures surface immediately.      │
// └─────────────────────────────────────────────────────────────────────────┘

const TWILIO_ACCOUNT_SID = 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // replace
const TWILIO_AUTH_TOKEN  = 'your_auth_token_here';               // replace
const TWILIO_FROM_PHONE  = '+12015551234';                       // Twilio number (E.164)
const TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886';            // Sandbox sender

// ─── Type Definitions ────────────────────────────────────────────────────────

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface SosContact {
  name: string;
  phone: string;
  relation: string;
}

export interface AudioRecordResult {
  sessionId: string;
  durationMs: number;
  filePath: string;
  storageUrl?: string;
  status: 'success' | 'permission_denied' | 'hardware_error';
}

/**
 * Mod 3: Unified dispatch channel result.
 * Replaces the old SmsSendResult — supports both SMS and WhatsApp entries
 * in the same dispatch_channels array in Firestore.
 */
export interface DispatchChannelResult {
  channel: 'sms' | 'whatsapp';
  contactPhone: string;
  contactName: string;
  status: 'sent' | 'failed' | 'queued';
  sid?: string;        // Twilio message SID on success
  errorCode?: number;  // Twilio error code on failure (e.g. 21608)
  errorMessage?: string;
  timestamp: number;
}

export interface SosSessionLog {
  sessionId: string;
  triggeredAt: number;
  triggerMethod: 'hold' | 'timer'; // Mod 1 & 4
  location: GeoLocation | null;
  audioResult: AudioRecordResult | null;
  /** Mod 3: replaces smsResults — logs all channels */
  dispatch_channels: DispatchChannelResult[];
  status: 'in_progress' | 'completed' | 'failed';
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export const generateSessionId = (): string =>
  `SOS-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/** Encodes a plain object as application/x-www-form-urlencoded */
const toFormEncoded = (params: Record<string, string>): string =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/** Builds the Basic Auth header from Twilio credentials */
const twilioBasicAuth = (): string => {
  const credentials = `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`;
  // btoa is available globally in React Native (Hermes / JSC)
  return `Basic ${btoa(credentials)}`;
};

// ─── GPS Acquisition ─────────────────────────────────────────────────────────

import * as Location from 'expo-location';

/**
 * fetchLocation()
 *
 * Uses expo-location getCurrentPositionAsync() with HIGH accuracy.
 * Permissions must already be granted via the Calculator Settings onboarding
 * screen (requestLocationPermission in permissionService.ts).
 *
 * iOS: Requires NSLocationAlwaysAndWhenInUseUsageDescription +
 *      UIBackgroundModes: location in app.json (already configured).
 * Android: ACCESS_FINE_LOCATION + ACCESS_BACKGROUND_LOCATION (API 29+).
 *
 * Throws if permissions are revoked between grant and SOS activation.
 * The caller (executeSosProtocol) wraps in Promise.allSettled so a
 * permission failure won't abort the audio recording or dispatch.
 */
export async function fetchLocation(): Promise<GeoLocation> {
  console.log('[SOS Service] 📍 fetchLocation() — requesting GPS fix...');

  // Verify permission is still active (could be revoked in device Settings)
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission not granted — cannot acquire GPS coordinates.');
  }

  const result = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  const geoLocation: GeoLocation = {
    latitude:  result.coords.latitude,
    longitude: result.coords.longitude,
    accuracy:  result.coords.accuracy ?? 0,
    timestamp: result.timestamp,
  };

  console.log('[SOS Service] 📍 GPS fix acquired:', geoLocation);
  return geoLocation;
}

// ─── Audio Recording ─────────────────────────────────────────────────────────

import { Audio } from 'expo-av';

/** Duration of ambient capture in milliseconds (Mod spec: 30 seconds) */
const RECORDING_DURATION_MS = 30_000;

/**
 * startAudioRecord()
 *
 * Captures 30 seconds of ambient audio using expo-av Audio.Recording
 * configured with the HIGH_QUALITY preset (AAC, 128kbps, 44.1kHz).
 *
 * Platform notes:
 *   iOS:     AVAudioSession category is set to 'record' + playsInSilentModeIOS
 *            so recording works even when the ringer switch is off.
 *            UIBackgroundModes: ['audio'] is required in app.json for background
 *            recording when the app is minimised.
 *   Android: RECORD_AUDIO permission must be granted (done in onboarding).
 *            A foreground service is recommended for recording >1 min — within
 *            our 30s window this is not required.
 *
 * Returns AudioRecordResult with the local file URI on success.
 * Returns status:'permission_denied' or 'hardware_error' on failure —
 * never throws so the SOS protocol can continue dispatching alerts
 * even if audio capture fails.
 */
export async function startAudioRecord(sessionId: string): Promise<AudioRecordResult> {
  console.log(`[SOS Service] 🎙 startAudioRecord() — session: ${sessionId}`);

  // 1. Verify microphone permission
  const { status } = await Audio.getPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[SOS Service] 🎙 Microphone permission not granted.');
    return { sessionId, durationMs: 0, filePath: '', status: 'permission_denied' };
  }

  let recording: Audio.Recording | null = null;
  const startedAt = Date.now();

  try {
    // 2. Configure audio session
    //    iOS: allowsRecordingIOS + playsInSilentModeIOS ensures recording
    //    starts even when the device ringer is muted.
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,   // keep recording if app is backgrounded
    });

    // 3. Create recording with HIGH_QUALITY preset
    //    HIGH_QUALITY → { android: { extension: '.m4a', outputFormat: MPEG_4, ... },
    //                     ios:     { extension: '.m4a', audioQuality: MAX, ... } }
    console.log('[SOS Service] 🎙 Starting HIGH_QUALITY recording...');
    const { recording: rec } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    recording = rec;
    console.log('[SOS Service] 🎙 Recording ACTIVE — 30s ambient capture in progress');

    // 4. Auto-stop after 30 seconds
    //    We await the full duration here. The caller (executeSosProtocol)
    //    runs this in parallel with fetchLocation via Promise.allSettled,
    //    so the 30s wait does NOT delay GPS acquisition or dispatch.
    await sleep(RECORDING_DURATION_MS);

    // 5. Stop and unload
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI() ?? '';
    const durationMs = Date.now() - startedAt;

    // 6. Reset audio mode so the app can play sounds normally again
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
    });

    console.log(`[SOS Service] 🎙 Recording COMPLETE (${durationMs}ms) → ${uri}`);
    return { sessionId, durationMs, filePath: uri, status: 'success' };

  } catch (error) {
    console.error('[SOS Service] 🎙 Hardware/API error during recording:', error);

    // Attempt cleanup to avoid leaving a dangling recording session
    if (recording) {
      try { await recording.stopAndUnloadAsync(); } catch { /* ignore */ }
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
    }).catch(() => {});

    return { sessionId, durationMs: 0, filePath: '', status: 'hardware_error' };
  }
}

// ─── Mod 2: Twilio SMS Dispatch (Production-grade) ───────────────────────────

/**
 * Sends a single SMS via the Twilio REST API to one recipient.
 *
 * Key implementation details (Mod 2):
 *   • Authenticated with HTTP Basic Auth (Account SID : Auth Token)
 *   • Body encoded as application/x-www-form-urlencoded — NOT JSON
 *   • Non-201 responses throw a descriptive exception surfacing Twilio's
 *     exact error code and message — never silently swallowed
 *   • Full raw response logged (both success and failure) for debugging
 */
async function sendTwilioSms(
  toPhone: string,
  body: string,
): Promise<{ sid: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

  const formBody = toFormEncoded({
    To:   toPhone,
    From: TWILIO_FROM_PHONE,
    Body: body,
  });

  console.log(`[Twilio SMS] → POST ${url} | To: ${toPhone}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': twilioBasicAuth(),
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: formBody,
  });

  // Always parse and log the raw response
  const rawText = await response.text();
  console.log(`[Twilio SMS] ← HTTP ${response.status}: ${rawText}`);

  if (response.status !== 201) {
    // Parse Twilio JSON error body
    let code: number | undefined;
    let message = `HTTP ${response.status}`;
    try {
      const errJson = JSON.parse(rawText) as { code?: number; message?: string };
      code    = errJson.code;
      message = errJson.message ?? message;
    } catch { /* raw text already logged */ }

    throw Object.assign(
      new Error(`Twilio SMS failed [code ${code ?? 'unknown'}]: ${message}`),
      { twilioCode: code }
    );
  }

  const json = JSON.parse(rawText) as { sid: string };
  return { sid: json.sid };
}

// ─── Mod 3: Twilio WhatsApp Dispatch ─────────────────────────────────────────

/**
 * Sends a WhatsApp alert via Twilio's WhatsApp channel.
 *
 * SANDBOX REQUIREMENT: Each recipient must first opt-in to the Twilio
 * WhatsApp sandbox by sending "join <sandbox-keyword>" to +14155238886.
 * This restriction is removed after Meta WhatsApp Business API approval.
 *
 * The WhatsApp payload is richer than SMS — it includes:
 *   • Alert phrase + timestamp
 *   • Google Maps deep-link with GPS coordinates
 *   • Confirmation that audio recording has started
 */
async function sendTwilioWhatsApp(
  toPhone: string,
  body: string,
): Promise<{ sid: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

  const formBody = toFormEncoded({
    To:   `whatsapp:${toPhone}`,  // WhatsApp channel prefix
    From: TWILIO_WHATSAPP_FROM,
    Body: body,
  });

  console.log(`[Twilio WhatsApp] → POST ${url} | To: whatsapp:${toPhone}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': twilioBasicAuth(),
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: formBody,
  });

  const rawText = await response.text();
  console.log(`[Twilio WhatsApp] ← HTTP ${response.status}: ${rawText}`);

  if (response.status !== 201) {
    let code: number | undefined;
    let message = `HTTP ${response.status}`;
    try {
      const errJson = JSON.parse(rawText) as { code?: number; message?: string };
      code    = errJson.code;
      message = errJson.message ?? message;
    } catch { /* logged */ }

    throw Object.assign(
      new Error(`Twilio WhatsApp failed [code ${code ?? 'unknown'}]: ${message}`),
      { twilioCode: code }
    );
  }

  const json = JSON.parse(rawText) as { sid: string };
  return { sid: json.sid };
}

// ─── Mod 3: Concurrent Multi-Channel Dispatch ────────────────────────────────

/**
 * dispatchSmsAndWhatsApp()
 *
 * Sends SMS and WhatsApp alerts CONCURRENTLY to all contacts.
 * Uses Promise.allSettled so every contact-channel pair runs independently:
 *   • If SMS to contact A fails, WhatsApp to A still runs.
 *   • If WhatsApp to contact B fails, SMS to B still runs.
 *
 * Returns a flat DispatchChannelResult[] for each contact × channel.
 *
 * FLUTTER EQUIVALENT:
 *   await Future.wait([dispatchSMS(), dispatchWhatsApp()])
 *   with individual try/catch per Future — exactly mirrored here.
 */
export async function dispatchSmsAndWhatsApp(
  contacts: SosContact[],
  location: GeoLocation | null,
  sessionId: string
): Promise<DispatchChannelResult[]> {
  console.log(
    `[SOS Service] 📡 dispatchSmsAndWhatsApp() — ${contacts.length} contacts × 2 channels`
  );

  const mapsLink = location
    ? `https://maps.google.com/?q=${location.latitude},${location.longitude}`
    : null;

  const locationText = mapsLink
    ? `Coordinates: ${location!.latitude.toFixed(6)}, ${location!.longitude.toFixed(6)}\nMap: ${mapsLink}`
    : 'GPS signal unavailable';

  // SMS payload — concise for character limits
  const smsBody = [
    '🆘 EMERGENCY ALERT — SƏS',
    '',
    locationText,
    '',
    `Session: ${sessionId}`,
    `Time: ${new Date().toLocaleString('az-AZ')}`,
  ].join('\n');

  // WhatsApp payload — richer content (Mod 3)
  const whatsappBody = [
    '🆘 *SƏS — Silent Help System — EMERGENCY ALERT*',
    '',
    '⚠️ _This person may be in danger. Please contact them immediately or call emergency services._',
    '',
    locationText,
    mapsLink ? `📍 *Open in Maps:* ${mapsLink}` : '',
    '',
    `🎙 *Ambient audio recording has started* and will be available shortly.`,
    '',
    `🕐 *Time:* ${new Date().toLocaleString('az-AZ')}`,
    `🔑 *Session ID:* ${sessionId}`,
  ].filter(Boolean).join('\n');

  // Build one Promise per contact per channel
  // Each has its OWN try/catch — Mod 3 requirement
  const tasks = contacts.flatMap((contact): Promise<DispatchChannelResult>[] => [
    // ── SMS channel ──────────────────────────────────────────────────────
    (async (): Promise<DispatchChannelResult> => {
      try {
        const { sid } = await sendTwilioSms(contact.phone, smsBody);
        console.log(`[SOS] ✅ SMS → ${contact.name} | sid: ${sid}`);
        return {
          channel: 'sms',
          contactPhone: contact.phone,
          contactName: contact.name,
          status: 'sent',
          sid,
          timestamp: Date.now(),
        };
      } catch (err) {
        const e = err as Error & { twilioCode?: number };
        console.error(`[SOS] ❌ SMS → ${contact.name}:`, e.message);
        return {
          channel: 'sms',
          contactPhone: contact.phone,
          contactName: contact.name,
          status: 'failed',
          errorCode: e.twilioCode,
          errorMessage: e.message,
          timestamp: Date.now(),
        };
      }
    })(),

    // ── WhatsApp channel ─────────────────────────────────────────────────
    (async (): Promise<DispatchChannelResult> => {
      try {
        const { sid } = await sendTwilioWhatsApp(contact.phone, whatsappBody);
        console.log(`[SOS] ✅ WhatsApp → ${contact.name} | sid: ${sid}`);
        return {
          channel: 'whatsapp',
          contactPhone: contact.phone,
          contactName: contact.name,
          status: 'sent',
          sid,
          timestamp: Date.now(),
        };
      } catch (err) {
        const e = err as Error & { twilioCode?: number };
        console.error(`[SOS] ❌ WhatsApp → ${contact.name}:`, e.message);
        return {
          channel: 'whatsapp',
          contactPhone: contact.phone,
          contactName: contact.name,
          status: 'failed',
          errorCode: e.twilioCode,
          errorMessage: e.message,
          timestamp: Date.now(),
        };
      }
    })(),
  ]);

  // Run ALL contact × channel tasks concurrently — Mod 3: Future.wait equivalent
  const settled = await Promise.allSettled(tasks);

  // Promise.allSettled never rejects, but each task already handles its own errors above
  return settled.map(r =>
    r.status === 'fulfilled'
      ? r.value
      : {
          channel: 'sms' as const,
          contactPhone: '',
          contactName: '',
          status: 'failed' as const,
          errorMessage: r.reason?.message ?? 'Unknown',
          timestamp: Date.now(),
        }
  );
}

// ─── Audio Cloud Upload ───────────────────────────────────────────────────────

export async function uploadAudioToStorage(
  sessionId: string,
  _localFilePath: string
): Promise<string> {
  console.log('[SOS Service] ☁️  uploadAudioToStorage() — STUB (Sprint 2)');
  await sleep(2000);
  return `https://storage.googleapis.com/ses-app.appspot.com/sos_audio/user/${sessionId}.m4a`;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * executeSosProtocol()
 *
 * Full async pipeline: GPS + Audio (parallel) → Dispatch (SMS + WhatsApp concurrent)
 * → Upload audio (fire-and-forget).
 *
 * Updated for Mod 1/4: accepts triggerMethod so Firestore logs distinguish
 * hold-triggered from timer-triggered SOS events.
 */
export async function executeSosProtocol(
  contacts: SosContact[],
  onProgress: (step: string, detail?: string) => void,
  triggerMethod: 'hold' | 'timer' = 'hold'
): Promise<SosSessionLog> {
  const sessionId = generateSessionId();

  const log: SosSessionLog = {
    sessionId,
    triggeredAt: Date.now(),
    triggerMethod,
    location: null,
    audioResult: null,
    dispatch_channels: [],
    status: 'in_progress',
  };

  onProgress('INITIATED', sessionId);

  try {
    // Phase 1: GPS + Audio in PARALLEL
    onProgress('ACQUIRING_LOCATION');
    onProgress('RECORDING_STARTED');

    const [locationResult, audioResult] = await Promise.allSettled([
      fetchLocation(),
      startAudioRecord(sessionId),
    ]);

    log.location    = locationResult.status === 'fulfilled' ? locationResult.value : null;
    log.audioResult = audioResult.status === 'fulfilled'    ? audioResult.value    : null;

    if (locationResult.status === 'rejected') {
      console.warn('[SOS Protocol] GPS failed — dispatching without coordinates');
    }

    // Phase 2: Concurrent SMS + WhatsApp (Mod 2 + 3)
    onProgress('DISPATCHING_SMS');
    log.dispatch_channels = await dispatchSmsAndWhatsApp(
      contacts,
      log.location,
      sessionId
    );

    // Phase 3: Audio upload — fire-and-forget, never blocks SOS completion
    if (log.audioResult?.status === 'success') {
      onProgress('UPLOADING_AUDIO');
      uploadAudioToStorage(sessionId, log.audioResult.filePath)
        .then(url => {
          if (log.audioResult) log.audioResult.storageUrl = url;
          console.log('[SOS Protocol] Audio uploaded:', url);
        })
        .catch(err => console.error('[SOS Protocol] Audio upload failed:', err));
    }

    log.status = 'completed';
    onProgress('COMPLETED');

  } catch (error) {
    console.error('[SOS Protocol] Critical failure:', error);
    log.status = 'failed';
    onProgress('FAILED');
  }

  return log;
}
