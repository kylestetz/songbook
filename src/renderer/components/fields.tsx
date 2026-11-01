import { useMemo, useRef, useState } from 'react';
import { Note } from '@tonaljs/tonal';
import {
  CHORD_SUFFIXES,
  displayNote,
  formatFrets,
  formatRoll,
  getTuning,
  guitarVoicing,
  parseChord,
  parseFrets,
  parseKey,
  parseNote,
  parseRoll,
  resolveNotes,
  type RollNote,
} from '../../core/theory';
import { getAudioEngine } from '../../core/audio';
import type { FieldOption, FieldSpec, WidgetValues } from '../../core/widgets';
import { rollRange } from '../../core/widgets';

export interface FieldProps {
  field: FieldSpec;
  value: string;
  values: WidgetValues;
  onChange(value: string): void;
  autoFocus?: boolean;
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
const pretty = (s: string) => s.replace(/#/g, '♯').replace(/(?<=[A-G])b/g, '♭');

function Hint({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <div className={`field-hint${ok ? '' : ' is-error'}`}>{children}</div>;
}

export function TextField({ field, value, onChange, autoFocus }: FieldProps) {
  return (
    <input
      className="input"
      value={value}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
      spellCheck={false}
    />
  );
}

export function SelectField({ field, value, onChange }: FieldProps) {
  const groups = useMemo(() => {
    const map = new Map<string, FieldOption[]>();
    for (const o of field.options ?? []) {
      const g = o.group ?? '';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    }
    return [...map.entries()];
  }, [field.options]);
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      {groups.map(([g, opts]) =>
        g ? (
          <optgroup key={g} label={g}>
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : (
          opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        ),
      )}
    </select>
  );
}

export function BooleanField({ field, value, onChange }: FieldProps) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={value === 'true'} onChange={(e) => onChange(e.target.checked ? 'true' : '')} />
      <span className="toggle-track" />
      <span className="toggle-label">{field.label}</span>
    </label>
  );
}

export function NumberField({ field, value, onChange }: FieldProps) {
  return <input className="input" type="number" min={field.min} max={field.max} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function NoteField({ field, value, onChange, autoFocus }: FieldProps) {
  const n = parseNote(value);
  const letter = n?.pc[0] ?? 'C';
  const acc = n ? n.pc.slice(1) : '';
  const oct = n?.oct ?? 4;
  const set = (l: string, a: string, o: number) => {
    onChange(`${l}${a}${o}`);
    getAudioEngine().play([`${l}${a}${o}`], { duration: 0.6 });
  };
  return (
    <div className="note-field">
      <input className="input" value={value} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} spellCheck={false} />
      <div className="segmented">
        {LETTERS.map((l) => (
          <button key={l} type="button" className={l === letter ? 'is-on' : ''} onClick={() => set(l, acc, oct)}>
            {l}
          </button>
        ))}
      </div>
      <div className="note-field-row">
        <div className="segmented">
          {[
            ['b', '♭'],
            ['', '♮'],
            ['#', '♯'],
          ].map(([a, label]) => (
            <button key={a} type="button" className={a === acc ? 'is-on' : ''} onClick={() => set(letter, a, oct)}>
              {label}
            </button>
          ))}
        </div>
        <label className="inline-label">
          Octave
          <select className="select select-sm" value={oct} onChange={(e) => set(letter, acc, +e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      </div>
      {!n && value && <Hint ok={false}>Not a note. Try something like C4, F#3 or Bb5.</Hint>}
    </div>
  );
}

export function ChordField({ field, value, onChange, autoFocus }: FieldProps) {
  const c = parseChord(value);
  const rootMatch = /^([A-G](?:#|b)?)(.*)$/.exec(value.trim());
  const root = rootMatch?.[1] ?? 'C';
  const suffix = rootMatch?.[2] ?? '';
  return (
    <div className="chord-field">
      <input className="input input-lg" value={value} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} spellCheck={false} />
      <div className="chord-field-row">
        <select className="select select-sm" value={ROOTS.includes(root) ? root : 'C'} onChange={(e) => onChange(e.target.value + suffix)} aria-label="Root">
          {ROOTS.map((r) => (
            <option key={r} value={r}>
              {pretty(r)}
            </option>
          ))}
        </select>
        <div className="chips-scroll">
          {CHORD_SUFFIXES.map((s) => (
            <button key={s || 'maj'} type="button" className={`chip-btn${s === suffix ? ' is-on' : ''}`} onClick={() => onChange(root + s)}>
              {s ? pretty(s) : 'maj'}
            </button>
          ))}
        </div>
      </div>
      {value ? (
        <Hint ok={!!c}>{c ? `${c.name} · ${c.notes.map((n) => displayNote(n)).join(' ')}${c.bass ? ` over ${displayNote(c.bass)}` : ''}` : 'Unknown chord symbol'}</Hint>
      ) : null}
    </div>
  );
}

export function NotesField({ field, value, values, onChange, autoFocus }: FieldProps) {
  const resolved = resolveNotes(value, parseInt(values.octave || '4', 10));
  return (
    <div>
      <input className="input input-lg" value={value} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} spellCheck={false} />
      {value ? <Hint ok={resolved.length > 0}>{resolved.length ? resolved.map((n) => displayNote(n)).join('  ') : "Couldn't read these notes"}</Hint> : null}
    </div>
  );
}

export function KeyField({ field, value, onChange }: FieldProps) {
  const k = parseKey(value);
  const root = k?.tonic ?? '';
  const minor = k?.minor ?? false;
  const set = (r: string, m: boolean) => onChange(r ? `${r}${m ? 'm' : ''}` : '');
  return (
    <div className="key-field">
      <select className="select" value={root} onChange={(e) => set(e.target.value, minor)} aria-label="Key root">
        {!field.required && <option value="">No key</option>}
        {ROOTS.map((r) => (
          <option key={r} value={r}>
            {pretty(r)}
          </option>
        ))}
      </select>
      <select className="select" value={minor ? 'minor' : 'major'} onChange={(e) => set(root || 'C', e.target.value === 'minor')} disabled={!root} aria-label="Key quality">
        <option value="major">major</option>
        <option value="minor">minor</option>
      </select>
    </div>
  );
}

export function FretsField({ field, value, values, onChange }: FieldProps) {
  const tuning = getTuning(values.tuning);
  const auto = values.chord ? guitarVoicing(values.chord, tuning) : null;
  const parsed = value ? parseFrets(value, tuning.notes.length) : null;
  return (
    <div>
      <input
        className="input mono"
        value={value}
        placeholder={auto ? `Automatic (${formatFrets(auto.frets)})` : field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {value && !parsed ? <Hint ok={false}>Use one symbol per string, like x02210, or dashes: x-10-12-12-10-x</Hint> : null}
    </div>
  );
}

/** An interactive piano-roll grid: click to add a note, drag to lengthen, click a note to remove it. */
export function RollField({ value, values, onChange }: FieldProps) {
  const notes = useMemo(() => parseRoll(value), [value]);
  const steps = Math.max(1, parseInt(values.steps || '16', 10));
  const perBeat = Math.max(1, parseInt(values.grid || '4', 10));
  const initial = useMemo(() => {
    const r = rollRange(notes);
    return { lo: Math.min(r.lo, 57), hi: Math.max(r.hi, 76) };
  }, []); // only on mount: the visible range shouldn't jump while editing
  const [range, setRange] = useState(initial);
  const [draft, setDraft] = useState<RollNote | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const CW = Math.max(12, Math.min(26, Math.floor(560 / steps)));
  const RH = 13;
  const LW = 34;
  const rows = range.hi - range.lo + 1;
  const width = LW + steps * CW;
  const height = rows * RH;

  const cellAt = (e: React.MouseEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const scale = width / rect.width;
    const x = (e.clientX - rect.left) * scale - LW;
    const y = (e.clientY - rect.top) * scale;
    return { step: Math.floor(x / CW), midi: range.hi - Math.floor(y / RH) };
  };
  const commit = (next: RollNote[]) => onChange(formatRoll(next));
  const audio = getAudioEngine();

  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const { step, midi } = cellAt(e);
    if (step < 0) {
      audio.play([Note.fromMidi(midi)], { duration: 0.5 });
      return;
    }
    const hit = notes.find((n) => Note.midi(n.pitch) === midi && step >= n.start && step < n.start + n.length);
    if (hit) {
      commit(notes.filter((n) => n !== hit));
      return;
    }
    const pitch = Note.fromMidi(midi);
    audio.play([pitch], { duration: 0.4 });
    setDraft({ pitch, start: step, length: 1 });
  };
  const onMove = (e: React.MouseEvent) => {
    if (!draft) return;
    const { step } = cellAt(e);
    setDraft({ ...draft, length: Math.max(1, Math.min(steps - draft.start, step - draft.start + 1)) });
  };
  const onUp = () => {
    if (!draft) return;
    commit([...notes, draft]);
    setDraft(null);
  };

  const shown = draft ? [...notes, draft] : notes;
  const black = (m: number) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

  return (
    <div className="roll-field">
      <div className="roll-field-toolbar">
        <span className="field-hint">Click to add a note, drag to lengthen, click a note to remove it.</span>
        <div className="segmented">
          <button type="button" onClick={() => setRange((r) => ({ lo: r.lo + 12, hi: r.hi + 12 }))} title="Octave up">
            ▲
          </button>
          <button type="button" onClick={() => setRange((r) => ({ lo: r.lo - 12, hi: r.hi - 12 }))} title="Octave down">
            ▼
          </button>
          <button type="button" onClick={() => commit([])} title="Clear all notes">
            Clear
          </button>
        </div>
      </div>
      <div className="roll-field-scroll">
        <svg
          ref={svgRef}
          className="mn-roll roll-field-svg"
          viewBox={`0 0 ${width + 1} ${height + 1}`}
          width={width + 1}
          style={{ minWidth: Math.min(width + 1, 480), maxWidth: (width + 1) * 1.5 }}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
        >
          {Array.from({ length: rows }, (_, i) => {
            const m = range.hi - i;
            return (
              <g key={m}>
                <rect className={`mn-roll-row${black(m) ? ' is-black' : ''}`} x={LW} y={i * RH} width={steps * CW} height={RH} />
                <rect className={`mn-roll-key${black(m) ? ' is-black' : ''}`} x={0.5} y={i * RH + 0.5} width={LW - 4} height={RH - 1} rx={2} />
                {m % 12 === 0 && (
                  <text className="mn-roll-label" x={4} y={i * RH + RH / 2} dominantBaseline="central">
                    C{Math.floor(m / 12) - 1}
                  </text>
                )}
              </g>
            );
          })}
          {Array.from({ length: steps + 1 }, (_, i) => (
            <line
              key={i}
              className={i % (perBeat * 4) === 0 ? 'mn-roll-bar' : i % perBeat === 0 ? 'mn-roll-beat' : 'mn-roll-step'}
              x1={LW + i * CW}
              x2={LW + i * CW}
              y1={0}
              y2={height}
            />
          ))}
          {shown.map((n, i) => {
            const m = Note.midi(n.pitch);
            if (m == null || m < range.lo || m > range.hi) return null;
            return (
              <rect
                key={i}
                className={`mn-roll-note${n === draft ? ' is-draft' : ''}`}
                x={LW + n.start * CW + 1}
                y={(range.hi - m) * RH + 1}
                width={Math.max(1, Math.min(n.length, steps - n.start) * CW - 2)}
                height={RH - 2}
                rx={3}
              />
            );
          })}
        </svg>
      </div>
      <input className="input mono input-sm" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} aria-label="Notes as text" />
    </div>
  );
}

export function Field(props: FieldProps) {
  const { field } = props;
  switch (field.type) {
    case 'select':
      return <SelectField {...props} />;
    case 'boolean':
      return <BooleanField {...props} />;
    case 'number':
      return <NumberField {...props} />;
    case 'note':
      return <NoteField {...props} />;
    case 'chord':
      return <ChordField {...props} />;
    case 'notes':
      return <NotesField {...props} />;
    case 'key':
      return <KeyField {...props} />;
    case 'frets':
      return <FretsField {...props} />;
    case 'roll':
      return <RollField {...props} />;
    default:
      return <TextField {...props} />;
  }
}
