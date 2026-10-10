import { darkColors, fontSize, lightColors, radius, spacing, type ThemeColors } from '@hb/shared';
import { useColorScheme } from 'react-native';

export interface Theme {
  colors: ThemeColors;
  dark: boolean;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
}

export function useTheme(): Theme {
  const dark = useColorScheme() === 'dark';
  return { colors: dark ? darkColors : lightColors, dark, spacing, radius, fontSize };
}
