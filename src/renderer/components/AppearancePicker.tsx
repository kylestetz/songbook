import { useState } from 'react';
import { THEMES, type ColorScheme } from '../../core/themes';
import { loadAppearance, setAppearance, type Appearance } from '../appearance';

const SCHEME_LABELS: Record<ColorScheme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

/** Theme and light/dark choice. App-wide, not stored in the note. */
export function AppearancePicker() {
  const [value, setValue] = useState<Appearance>(loadAppearance);
  const update = (patch: Partial<Appearance>) => {
    const next = { ...value, ...patch };
    setValue(next);
    setAppearance(next);
  };

  return (
    <>
      <div className="theme-grid" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value.theme === t.id}
            title={t.description}
            // Each swatch renders in its own theme's tokens.
            data-theme={t.id}
            className={`theme-swatch${value.theme === t.id ? ' is-on' : ''}`}
            onClick={() => update({ theme: t.id })}
          >
            <span className="theme-swatch-sample" aria-hidden>
              Aa
            </span>
            <span className="theme-swatch-label">{t.label}</span>
            <span className="theme-swatch-dots" aria-hidden>
              <i style={{ background: 'var(--mn-accent)' }} />
              <i style={{ background: 'var(--mn-text)' }} />
              <i style={{ background: 'var(--mn-surface)' }} />
            </span>
          </button>
        ))}
      </div>
      <div className="settings-row">
        <div className="segmented" role="radiogroup" aria-label="Light or dark">
          {(Object.keys(SCHEME_LABELS) as ColorScheme[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={value.scheme === s}
              className={value.scheme === s ? 'is-on' : ''}
              onClick={() => update({ scheme: s })}
            >
              {SCHEME_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
