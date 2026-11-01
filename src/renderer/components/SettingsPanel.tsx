import { useEffect, useRef } from 'react';
import { getAudioEngine, INSTRUMENTS } from '../../core/audio';
import { effectiveSettings, type DocSettings } from '../../core/markdown';
import { IconPlay } from './icons';

interface Props {
  settings: DocSettings;
  onChange(settings: DocSettings): void;
  onClose(): void;
}

export function SettingsPanel({ settings, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const eff = effectiveSettings(settings);
  const set = (patch: Partial<DocSettings>) => onChange({ ...settings, ...patch });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (ref.current && !ref.current.contains(t) && !t.closest('[data-settings-toggle]')) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown, true);
    };
  }, [onClose]);

  const preview = (sound: string) => {
    const audio = getAudioEngine();
    audio.sequence(
      [
        { time: 0, notes: ['C4'], duration: 0.4 },
        { time: 0.22, notes: ['E4'], duration: 0.4 },
        { time: 0.44, notes: ['G4'], duration: 0.4 },
        { time: 0.7, notes: ['C3', 'E4', 'G4', 'C5'], duration: 1.4, strum: 0.015 },
      ],
      { instrument: sound },
    );
  };

  return (
    <div className="popover settings-panel" ref={ref} role="dialog" aria-label="Document settings">
      <div className="settings-section-label">Sound</div>
      <div className="instrument-grid">
        {INSTRUMENTS.map((inst) => (
          <button
            key={inst.id}
            type="button"
            className={`instrument${eff.sound === inst.id ? ' is-on' : ''}`}
            onClick={() => {
              set({ sound: inst.id });
              preview(inst.id);
            }}
          >
            <span>{inst.label}</span>
            <IconPlay className="instrument-play" />
          </button>
        ))}
      </div>

      <div className="settings-row">
        <label className="form-label" htmlFor="tempo">
          Tempo
        </label>
        <div className="range-row">
          <input id="tempo" type="range" min={40} max={220} value={eff.tempo} onChange={(e) => set({ tempo: +e.target.value })} />
          <span className="range-value">{eff.tempo} bpm</span>
        </div>
      </div>
      <div className="settings-row">
        <label className="form-label" htmlFor="volume">
          Volume
        </label>
        <div className="range-row">
          <input
            id="volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={eff.volume}
            onChange={(e) => set({ volume: +e.target.value })}
          />
          <span className="range-value">{Math.round(eff.volume * 100)}%</span>
        </div>
      </div>

      <div className="settings-section-label">Publishing</div>
      <div className="settings-row">
        <label className="form-label">Title</label>
        <input
          className="input"
          value={typeof settings.title === 'string' ? settings.title : ''}
          placeholder="Uses the first heading"
          onChange={(e) => set({ title: e.target.value || undefined })}
        />
      </div>
      <div className="settings-row">
        <label className="form-label">Author</label>
        <input className="input" value={typeof settings.author === 'string' ? settings.author : ''} onChange={(e) => set({ author: e.target.value || undefined })} />
      </div>
      <div className="settings-row">
        <label className="form-label">Description</label>
        <textarea
          className="input"
          rows={2}
          value={typeof settings.description === 'string' ? settings.description : ''}
          onChange={(e) => set({ description: e.target.value || undefined })}
        />
      </div>
      <div className="settings-foot">Stored in the note's front matter.</div>
    </div>
  );
}
