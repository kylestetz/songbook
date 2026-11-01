/**
 * Theme registry. The palettes themselves live in CSS (src/core/styles/themes/),
 * keyed by `data-theme`; this file is the list the app offers and the contract
 * every theme stylesheet has to fulfil.
 */

export interface ThemeInfo {
  id: string;
  label: string;
  description: string;
}

export const THEMES = [
  { id: 'studio', label: 'Studio', description: 'Neutral and quiet, with a blue accent' },
  { id: 'manuscript', label: 'Manuscript', description: 'Warm paper, serif type, terracotta ink' },
  { id: 'nord', label: 'Nord', description: 'Arctic blues and a geometric sans' },
  { id: 'rose-pine', label: 'Rosé Pine', description: 'Soft dusk tones with an iris accent' },
] as const satisfies readonly ThemeInfo[];

export type ThemeId = (typeof THEMES)[number]['id'];
export const DEFAULT_THEME: ThemeId = 'studio';

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/** 'system' follows the OS; the others pin the scheme. */
export type ColorScheme = 'system' | 'light' | 'dark';
export const COLOR_SCHEMES: readonly ColorScheme[] = ['system', 'light', 'dark'];

export function isColorScheme(value: unknown): value is ColorScheme {
  return COLOR_SCHEMES.includes(value as ColorScheme);
}

/**
 * Every custom property a theme must define. Everything else (accent tints,
 * hover washes, shadows, key marks) is derived in tokens.css.
 */
export const THEME_TOKENS = [
  // Typography
  '--mn-font-ui',
  '--mn-font-body',
  '--mn-font-heading',
  '--mn-font-label',
  '--mn-font-mono',
  '--mn-body-size',
  '--mn-body-leading',
  '--mn-heading-weight',
  '--mn-heading-tracking',
  // Shape
  '--mn-radius-lg',
  '--mn-radius',
  '--mn-radius-sm',
  '--mn-radius-xs',
  // Surfaces, back to front
  '--mn-bg',
  '--mn-sidebar',
  '--mn-surface',
  '--mn-card',
  '--mn-popover',
  '--mn-code-bg',
  // Text and lines
  '--mn-text',
  '--mn-muted',
  '--mn-faint',
  '--mn-border',
  '--mn-border-strong',
  // Accent and status
  '--mn-accent',
  '--mn-accent-strong',
  '--mn-on-accent',
  '--mn-danger',
  // Instruments
  '--mn-key-white',
  '--mn-key-white-edge',
  '--mn-key-black',
  '--mn-shadow-color',
  // Code
  '--mn-syntax-keyword',
  '--mn-syntax-string',
  '--mn-syntax-number',
  '--mn-syntax-function',
  '--mn-syntax-type',
  '--mn-syntax-attr',
] as const;

/** Apply a theme and scheme to an element (the document root by default). */
export function applyTheme(theme: ThemeId, scheme: ColorScheme, el: HTMLElement = document.documentElement) {
  el.dataset.theme = theme;
  if (scheme === 'system') delete el.dataset.colorScheme;
  else el.dataset.colorScheme = scheme;
}
