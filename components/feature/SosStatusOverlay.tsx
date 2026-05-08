/**
 * SosStatusOverlay — Internal Debug/Status Component (Mod 2 + 3 updated)
 *
 * Shows dispatch_channels results (SMS + WhatsApp) instead of the old smsResults.
 * Still only shown in the dev monitor modal — never on the calculator face.
 */

import React, { memo } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SosState } from '@/hooks/useSosController';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '@/constants/theme';

interface Props {
  sosState: SosState;
  onDismiss: () => void;
}

const stepLabel: Record<string, { icon: keyof typeof MaterialIcons.glyphMap; label: string }> = {
  INITIATED:           { icon: 'lock',           label: 'Protocol Initiated' },
  ACQUIRING_LOCATION:  { icon: 'location-on',    label: 'Acquiring GPS...' },
  RECORDING_STARTED:   { icon: 'mic',            label: 'Ambient Recording Active' },
  DISPATCHING_SMS:     { icon: 'send',           label: 'Dispatching SMS + WhatsApp' },
  UPLOADING_AUDIO:     { icon: 'cloud-upload',   label: 'Uploading to Cloud Storage' },
  COMPLETED:           { icon: 'check-circle',   label: 'Protocol Complete' },
  FAILED:              { icon: 'error',          label: 'Protocol Encountered Error' },
  IDLE:                { icon: 'radio-button-unchecked', label: 'Standby' },
};

const channelIcon: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  sms:       'sms',
  whatsapp:  'chat',
};

function SosStatusOverlay({ sosState, onDismiss }: Props) {
  const { mode, currentStep, sessionLog, stepHistory, triggerMethod } = sosState;

  const stepInfo  = stepLabel[currentStep] ?? { icon: 'help', label: currentStep };
  const isComplete = mode === 'COMPLETED';
  const isError    = mode === 'ERROR';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[
          styles.statusDot,
          isComplete ? styles.dotGreen : isError ? styles.dotRed : styles.dotAmber,
        ]} />
        <Text style={styles.title}>SOS Protocol Monitor</Text>
        {triggerMethod ? (
          <View style={styles.triggerBadge}>
            <MaterialIcons
              name={triggerMethod === 'timer' ? 'timer' : 'touch-app'}
              size={12}
              color={triggerMethod === 'timer' ? '#FF9F0A' : '#00C6FF'}
            />
            <Text style={[
              styles.triggerText,
              { color: triggerMethod === 'timer' ? '#FF9F0A' : '#00C6FF' }
            ]}>
              {triggerMethod === 'timer' ? 'Timer' : 'Hold'}
            </Text>
          </View>
        ) : null}
        <Pressable onPress={onDismiss} hitSlop={12}>
          <MaterialIcons name="close" size={20} color={Colors.textSubtle} />
        </Pressable>
      </View>

      {/* Current Step */}
      <View style={styles.stepCard}>
        <MaterialIcons
          name={stepInfo.icon}
          size={28}
          color={isComplete ? '#30D158' : isError ? '#FF453A' : '#FFD60A'}
        />
        <View style={{ marginLeft: Spacing.sm, flex: 1 }}>
          <Text style={styles.stepLabel}>{stepInfo.label}</Text>
          {sessionLog?.sessionId ? (
            <Text style={styles.sessionId}>Session: {sessionLog.sessionId}</Text>
          ) : null}
        </View>
      </View>

      {/* Dispatch Channels (Mod 2 + 3) */}
      {sessionLog?.dispatch_channels && sessionLog.dispatch_channels.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dispatch Channels</Text>
          {sessionLog.dispatch_channels.map((r, i) => (
            <View key={i} style={styles.channelRow}>
              <MaterialIcons
                name={channelIcon[r.channel] ?? 'send'}
                size={14}
                color={r.channel === 'whatsapp' ? '#25D366' : '#00C6FF'}
              />
              <MaterialIcons
                name={r.status === 'sent' ? 'check-circle' : 'cancel'}
                size={14}
                color={r.status === 'sent' ? '#30D158' : '#FF453A'}
              />
              <Text style={styles.channelText}>
                [{r.channel.toUpperCase()}] {r.contactName} ({r.contactPhone})
                {' — '}{r.status.toUpperCase()}
                {r.sid ? `  sid:${r.sid.slice(-8)}` : ''}
                {r.errorCode ? `  err:${r.errorCode}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Location */}
      {sessionLog?.location ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location Captured</Text>
          <Text style={styles.locationText}>
            {sessionLog.location.latitude.toFixed(6)}, {sessionLog.location.longitude.toFixed(6)}
          </Text>
          <Text style={styles.locationText}>
            Accuracy: ±{sessionLog.location.accuracy.toFixed(0)}m
          </Text>
        </View>
      ) : null}

      {/* Step History Log */}
      <View style={[styles.section, { flex: 1 }]}>
        <Text style={styles.sectionTitle}>Execution Log</Text>
        <ScrollView style={styles.logScroll} showsVerticalScrollIndicator={false}>
          {stepHistory.map((entry, i) => (
            <Text key={i} style={styles.logEntry}>{entry}</Text>
          ))}
        </ScrollView>
      </View>

      {/* Dismiss */}
      {isComplete || isError ? (
        <Pressable style={styles.dismissBtn} onPress={onDismiss}>
          <Text style={styles.dismissText}>Close Monitor</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotGreen:  { backgroundColor: '#30D158' },
  dotAmber:  { backgroundColor: '#FFD60A' },
  dotRed:    { backgroundColor: '#FF453A' },
  title: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  triggerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  triggerText: {
    fontSize: 11,
    fontWeight: FontWeight.semibold,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13131A',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,198,255,0.15)',
  },
  stepLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  sessionId: {
    fontSize: FontSize.xs,
    color: Colors.textSubtle,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  section: { marginBottom: Spacing.md },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: '#00C6FF',
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginBottom: 5,
  },
  channelText: {
    fontSize: 11,
    color: Colors.textSecondary,
    flex: 1,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  locationText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
  },
  logScroll: {
    backgroundColor: '#0D0D14',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    maxHeight: 160,
  },
  logEntry: {
    fontSize: 11,
    color: '#4EC9B0',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  dismissBtn: {
    backgroundColor: '#1C1C2E',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,198,255,0.2)',
  },
  dismissText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: '#00C6FF',
  },
});

export default memo(SosStatusOverlay);
