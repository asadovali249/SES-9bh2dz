/**
 * CalculatorDisplay — UI Component
 * 
 * Shows the current value. Dynamically scales font size when number is long.
 * Completely indistinguishable from a stock calculator display.
 */

import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useSettings } from '@/hooks/useSettings';

interface Props {
  value: string;
  operator: string | null;
  previousValue: string;
}

function CalculatorDisplay({ value, operator, previousValue }: Props) {
  const { appearance } = useSettings();
  const baseMax = appearance.largeText ? FontSize.displayLg : 56;

  // Dynamically scale font based on digit count
  const charCount = value.length;
  const fontSize =
    charCount <= 6 ? baseMax :
    charCount <= 9 ? (appearance.largeText ? 60 : 48) :
    charCount <= 11 ? (appearance.largeText ? 48 : 38) : (appearance.largeText ? 38 : 30);

  return (
    <View style={styles.container}>
      {/* Previous expression hint */}
      {previousValue && operator ? (
        <Text style={styles.hint} numberOfLines={1}>
          {previousValue} {operator}
        </Text>
      ) : null}

      {/* Main display */}
      <Text
        style={[styles.displayText, { fontSize }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.4}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg + 4,
    paddingBottom: Spacing.md,
  },
  hint: {
    fontSize: FontSize.lg,
    color: Colors.textSubtle,
    marginBottom: 4,
  },
  displayText: {
    color: Colors.displayText,
    fontWeight: '200',
    letterSpacing: -2,
  },
});

export default memo(CalculatorDisplay);
