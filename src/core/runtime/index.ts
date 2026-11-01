/**
 * Runtime for published documents. Built as a standalone IIFE (see
 * vite.runtime.config.ts) and inlined into exported HTML files. It finds the
 * widget placeholders emitted by the publisher and renders them.
 */
import '../styles/theme.css';
import '../styles/content.css';
import '../styles/widgets.css';
import './page.css';
import { getAudioEngine } from '../audio';
import { renderWidget, type WidgetValues } from '../widgets';

interface RuntimeSettings {
  sound: string;
  tempo: number;
  volume: number;
}

function readSettings(): RuntimeSettings {
  const el = document.getElementById('mn-settings');
  const defaults = { sound: 'piano', tempo: 96, volume: 0.8 };
  try {
    return { ...defaults, ...(el ? JSON.parse(el.textContent || '{}') : {}) };
  } catch {
    return defaults;
  }
}

export function hydrate(root: ParentNode = document) {
  const settings = readSettings();
  const audio = getAudioEngine();
  audio.instrument = settings.sound;
  audio.tempo = settings.tempo;
  audio.setVolume(settings.volume);
  const ctx = { audio, settings: () => ({ sound: settings.sound, tempo: settings.tempo }) };
  root.querySelectorAll<HTMLElement>('[data-widget]').forEach((el) => {
    let values: WidgetValues = {};
    try {
      values = JSON.parse(el.dataset.values || '{}');
    } catch {
      /* leave empty */
    }
    renderWidget(el, el.dataset.widget!, values, ctx);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrate());
else hydrate();
