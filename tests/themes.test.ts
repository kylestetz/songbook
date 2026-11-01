import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderDocument } from '../src/core/publish';
import { THEME_TOKENS, THEMES } from '../src/core/themes';

const root = resolve(import.meta.dirname, '..');
const themesDir = resolve(root, 'src/core/styles/themes');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

/** Custom properties declared directly in a stylesheet (ignores var() reads). */
function declared(css: string): Set<string> {
  return new Set([...css.matchAll(/(--mn-[\w-]+)\s*:/g)].map((m) => m[1]));
}

describe('themes', () => {
  it('has a stylesheet for every registered theme, and nothing unregistered', () => {
    const files = readdirSync(themesDir).map((f) => f.replace(/\.css$/, ''));
    expect(files.sort()).toEqual(THEMES.map((t) => t.id).sort());
  });

  it('every theme is imported by the theme entry point', () => {
    const entry = read('src/core/styles/theme.css');
    for (const t of THEMES) expect(entry).toContain(`./themes/${t.id}.css`);
  });

  for (const t of THEMES) {
    it(`${t.id} defines every theme token, scoped to [data-theme='${t.id}']`, () => {
      const css = readFileSync(resolve(themesDir, `${t.id}.css`), 'utf8');
      expect(css).toContain(`[data-theme='${t.id}']`);
      const missing = THEME_TOKENS.filter((tok) => !declared(css).has(tok));
      expect(missing).toEqual([]);
    });
  }

  it('component stylesheets use tokens, not raw colors', () => {
    const files = [
      'src/core/styles/content.css',
      'src/core/styles/widgets.css',
      'src/core/runtime/page.css',
      'src/renderer/styles/app.css',
      'src/renderer/styles/editor.css',
    ];
    for (const f of files) {
      const raw = read(f).match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g);
      expect(raw, f).toBeNull();
    }
  });

  it('publishes with the chosen theme', () => {
    const opts = { runtimeJs: '', runtimeCss: '' };
    expect(renderDocument('# Hi', { ...opts, theme: 'nord' })).toContain('<html lang="en" data-theme="nord">');
    expect(renderDocument('# Hi', { ...opts, theme: 'bogus' })).toContain('<html lang="en">');
  });
});
