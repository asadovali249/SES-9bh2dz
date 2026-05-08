// SƏS — Silent Help System
// Design System: "Dark Glass" metaphor — matte black surface, layered depth

export const Colors = {
  // Core surfaces
  background: '#000000',
  surfaceDeep: '#1C1C1E',
  surfaceMid: '#2C2C2E',
  surfaceLight: '#3A3A3C',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#EBEBF5',
  textSubtle: '#8E8E93',
  textInverse: '#000000',

  // Semantic
  digitButton: '#333333',
  operatorButton: '#FF9F0A',
  functionButton: '#505050',
  equalsButton: '#FF9F0A',
  displayText: '#FFFFFF',

  // SOS state (never shown in UI — internal only)
  sosActive: '#FF3B30',
  sosInactive: 'transparent',

  // Agile doc screen
  docBackground: '#0A0A0F',
  docSurface: '#13131A',
  docAccent: '#00C6FF',
  docAccentAlt: '#FF6B35',
  docGreen: '#30D158',
  docYellow: '#FFD60A',
  docRed: '#FF453A',

  // Borders
  border: 'rgba(255,255,255,0.08)',
  borderDoc: 'rgba(0,198,255,0.15)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 64,
  displayLg: 80,
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
  button: 100, // pill-shaped calculator buttons
};
