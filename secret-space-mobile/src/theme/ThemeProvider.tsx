import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ColorScheme, ThemeColors, darkColors, lightColors, gradientStops } from './colors';
import { spacing, radii, screenPadding, bottomNavReserve } from './spacing';
import { typography } from './typography';
import { shadows } from './shadows';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  shadows: typeof shadows;
  screenPadding: number;
  bottomNavReserve: number;
  gradientStops: typeof gradientStops;
}

interface ThemeCtx {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);
const STORAGE_KEY = 'secretspace.themePreference';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  // Dark is the brand default; users can switch in Settings → Appearance.
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
    });
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(STORAGE_KEY, p);
  }, []);

  const scheme: ColorScheme = preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;

  const theme: Theme = useMemo(
    () => ({
      scheme,
      colors: scheme === 'dark' ? darkColors : lightColors,
      spacing,
      radii,
      typography,
      shadows,
      screenPadding,
      bottomNavReserve,
      gradientStops,
    }),
    [scheme]
  );

  return <ThemeContext.Provider value={{ theme, preference, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx.theme;
}

export function useThemePreference() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference must be used within ThemeProvider');
  return { preference: ctx.preference, setPreference: ctx.setPreference };
}
