/** App-wide appearance preference (theme + light/dark), stored per machine. */
import { applyTheme, DEFAULT_THEME, isColorScheme, isThemeId, type ColorScheme, type ThemeId } from '../core/themes';

export interface Appearance {
  theme: ThemeId;
  scheme: ColorScheme;
}

const THEME_KEY = 'mn:theme';
const SCHEME_KEY = 'mn:color-scheme';

export function loadAppearance(): Appearance {
  let theme: unknown;
  let scheme: unknown;
  try {
    theme = localStorage.getItem(THEME_KEY);
    scheme = localStorage.getItem(SCHEME_KEY);
  } catch {
    /* storage unavailable: use defaults */
  }
  return {
    theme: isThemeId(theme) ? theme : DEFAULT_THEME,
    scheme: isColorScheme(scheme) ? scheme : 'system',
  };
}

export function setAppearance(next: Appearance) {
  applyTheme(next.theme, next.scheme);
  try {
    localStorage.setItem(THEME_KEY, next.theme);
    localStorage.setItem(SCHEME_KEY, next.scheme);
  } catch {
    /* not persisted, still applied */
  }
}
