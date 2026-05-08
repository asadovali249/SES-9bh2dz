// SƏS App Configuration
// PIN is stored only in-memory — never persisted to storage

export const SOS_CONFIG = {
  // The secret PIN that triggers SOS mode
  // In production this would be user-configurable and stored securely
  TRIGGER_PIN: '9999',
  TRIGGER_SUFFIX: '=',

  // Mocked emergency contacts (in Sprint 2 would come from Firestore)
  EMERGENCY_CONTACTS: [
    { name: 'Ana', phone: '+994501234567', relation: 'Mother' },
    { name: 'Leyla', phone: '+994552345678', relation: 'Sister' },
  ],

  // SOS protocol timing (ms)
  LOCATION_FETCH_TIMEOUT: 5000,
  AUDIO_RECORDING_DURATION: 30000, // 30 seconds ambient capture
  SMS_RETRY_COUNT: 3,
  SMS_RETRY_DELAY: 2000,

  // Version
  APP_VERSION: '1.0.0-MVP',
  SPRINT: 'Sprint 1',
};

export const CALCULATOR_DISPLAY_LIMIT = 12; // max digits before overflow notation
