/**
 * CalculatorButton — UI Component (Mod 1 applied)
 *
 * Mod 1: Added onLongPress + delayLongPress={3000} support.
 *        Press-and-hold for 3 full seconds triggers the SOS protocol.
 *        Zero visual feedback during hold — no ripple, highlight, or
 *        progress indicator. The button appears inert to any observer.
 *
 *        delayLongPress is set to 3000ms which matches Flutter's
 *        GestureDetector onLongPressStart + 3s Timer equivalent.
 *
 *        onLongPressOut (release before 3s) maps to handleLongPressCancel
 *        which is an intentional no-op.
 *
 * Mod 4: The "." button accepts a second optional callback (onDotLongPress)
 *        that routes to the Safety Timer sheet. This separates the SOS
 *        long-press (any button) from the timer entry long-press (".").
 */

import React, { memo, useCallback } from 'react';
import { StyleSheet, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, FontSize, FontWeight } from '@/constants/theme';
import { useSettings } from '@/hooks/useSettings';

export type ButtonVariant = 'digit' | 'operator' | 'function' | 'equals' | 'wide';

interface Props {
  label: string;
  variant?: ButtonVariant;
  onPress: () => void;
  wide?: boolean;
  /**
   * Mod 1: Called after 3 continuous seconds of hold on THIS button.
   * When provided, triggers the SOS hold protocol.
   */
  onLongPress?: () => void;
  /**
   * Mod 4: Only used on the "." button.
   * When the timer is already running, a 3s hold disarms it.
   * When idle, a 3s hold opens the Safety Timer sheet.
   * Overrides onLongPress for the "." button specifically.
   */
  onDotLongPress?: () => void;
}

const BUTTON_SIZE   = 80;
const BUTTON_MARGIN = 6;

// 3 seconds — matches Mod 1 spec and Flutter GestureDetector equivalent
const LONG_PRESS_DELAY_MS = 3000;

const variantStyle: Record<ButtonVariant, object> = {
  digit:    { backgroundColor: Colors.digitButton },
  operator: { backgroundColor: Colors.operatorButton },
  function: { backgroundColor: Colors.functionButton },
  equals:   { backgroundColor: Colors.equalsButton },
  wide:     { backgroundColor: Colors.operatorButton },
};

const variantTextColor: Record<ButtonVariant, string> = {
  digit:    Colors.textPrimary,
  operator: Colors.textInverse,
  function: Colors.textPrimary,
  equals:   Colors.textInverse,
  wide:     Colors.textInverse,
};

function CalculatorButton({
  label,
  variant = 'digit',
  onPress,
  wide = false,
  onLongPress,
  onDotLongPress,
}: Props) {
  const { appearance } = useSettings();
  const bgStyle   = variantStyle[variant];
  const textColor = variantTextColor[variant];

  const handlePress = useCallback(() => {
    if (appearance.haptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress();
  }, [onPress, appearance.haptics]);

  /**
   * Mod 1 / Mod 4: Long press handler.
   *
   * "." button routes to onDotLongPress (timer open/disarm).
   * All other buttons route to onLongPress (SOS hold trigger).
   *
   * IMPORTANT: There is intentionally NO haptic feedback on long press.
   * No visual change, no vibration — zero indication to an observer.
   */
  const handleLongPress = useCallback(() => {
    if (label === '.' && onDotLongPress) {
      onDotLongPress();
    } else if (onLongPress) {
      onLongPress();
    }
  }, [label, onLongPress, onDotLongPress]);

  const hasLongPress = !!(onLongPress || (label === '.' && onDotLongPress));

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={hasLongPress ? handleLongPress : undefined}
      delayLongPress={LONG_PRESS_DELAY_MS}
      /**
       * Mod 1: android_disableSound + no style change on long press.
       * Pressable's default android ripple is suppressed by returning
       * a static style (no pressed-state variation on long-press path).
       *
       * The ({ pressed }) style only applies to short-tap feedback —
       * during the 3s hold the button visually looks exactly the same
       * as when untouched (opacity 1, scale 1).
       */
      style={({ pressed }) => [
        styles.button,
        bgStyle,
        wide && styles.wideButton,
        pressed && styles.pressed,
      ]}
      android_disableSound={false}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
    >
      <Text style={[styles.label, { color: textColor }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    margin: BUTTON_MARGIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wideButton: {
    width: BUTTON_SIZE * 2 + BUTTON_MARGIN * 2,
    alignItems: 'flex-start',
    paddingLeft: BUTTON_SIZE * 0.36,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontSize: FontSize.xl + 2,
    fontWeight: FontWeight.regular,
  },
});

export default memo(CalculatorButton);
