/**
 * Design tokens communs. Palette sobre et rassurante : bleu nuit, lilas, et des couleurs
 * d'état franches réservées aux alertes.
 */
export const palette = {
  night900: '#16122B',
  night800: '#221C42',
  night700: '#2F2758',
  lilac600: '#5B47D6',
  lilac500: '#6E5BF0',
  lilac300: '#B7ACFA',
  lilac100: '#ECE9FE',
  sand50: '#FAF9FC',
  white: '#FFFFFF',
  grey100: '#F1F0F5',
  grey200: '#E3E1EA',
  grey400: '#A19DB0',
  grey600: '#625D73',
  grey800: '#2E2A3B',
  red600: '#D93A3F',
  red100: '#FDE8E8',
  amber600: '#C27803',
  amber100: '#FEF3DC',
  green600: '#1F8A5B',
  green100: '#E2F5EC',
  blue600: '#2563EB',
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  primarySoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  /** Couleur du tracé du trajet prévu. */
  route: string;
  /** Marqueur de la cliente. */
  client: string;
  /** Marqueur du garde. */
  guard: string;
}

export const lightColors: ThemeColors = {
  background: palette.sand50,
  surface: palette.white,
  surfaceMuted: palette.grey100,
  border: palette.grey200,
  text: palette.grey800,
  textMuted: palette.grey600,
  primary: palette.lilac600,
  primaryText: palette.white,
  primarySoft: palette.lilac100,
  danger: palette.red600,
  dangerSoft: palette.red100,
  warning: palette.amber600,
  warningSoft: palette.amber100,
  success: palette.green600,
  successSoft: palette.green100,
  route: palette.lilac500,
  client: '#E0457B',
  guard: palette.blue600,
};

export const darkColors: ThemeColors = {
  background: palette.night900,
  surface: palette.night800,
  surfaceMuted: palette.night700,
  border: '#3A3366',
  text: '#F2F0FA',
  textMuted: palette.lilac300,
  primary: palette.lilac500,
  primaryText: palette.white,
  primarySoft: '#2E2766',
  danger: '#F2555A',
  dangerSoft: '#3D1C24',
  warning: '#F0A92E',
  warningSoft: '#3A2D14',
  success: '#3CC48A',
  successSoft: '#163327',
  route: palette.lilac300,
  client: '#FF6B9E',
  guard: '#6EA8FF',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 26, xxl: 34 } as const;
