import { Platform } from 'react-native';

export const palette = {
  paper: '#FAF8F3',
  surface: '#FFFFFF',
  ink: '#17312B',
  inkMuted: '#66736E',
  moss900: '#173C31',
  moss800: '#255443',
  moss700: '#39745E',
  moss200: '#C9DED3',
  moss100: '#E7F0EB',
  moss50: '#F2F7F4',
  persimmon600: '#D9673F',
  persimmon200: '#F6C8B4',
  persimmon100: '#FDE9DE',
  line: '#DDE4DF',
  danger: '#B33A32',
  dangerSoft: '#FCEDEC',
  warning: '#7A5A18',
  warningSoft: '#FFF6D8',
  white: '#FFFFFF',
  black: '#0A0F0D',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const type = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  body: Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: 'System' }),
  japanese: Platform.select({ ios: 'Hiragino Sans', android: 'sans-serif', default: 'System' }),
} as const;
export const shadow = {
  shadowColor: palette.ink,
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.08,
  shadowRadius: 20,
  elevation: 4,
} as const;
