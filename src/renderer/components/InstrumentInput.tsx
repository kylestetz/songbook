/**
 * Enter notes and chords by playing them: piano keys or a guitar fretboard,
 * with typing as a fallback. Shown as a full-width section along the bottom of
 * widget editors. The chosen input is remembered across editors and sessions.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Note } from '@tonaljs/tonal';
import {
  detectChords,
  displayNote,
  fitToStrings,
  formatFrets,
  friendlyNote,
  spellNotes,
  getTuning,
  guitarVoicing,
  intervalBetween,
  MAX_FRET,
  parseChord,
  parseFrets,
  parseNote,
  parseProgression,
  prettyAccidentals,
  resolveNotes,
  voiceChord,
  type Frets,
  type Tuning,
} from '../../core/theory';
import { getAudioEngine } from '../../core/audio';
import type { FieldSpec, InstrumentBinding, WidgetDefinition, WidgetValues } from '../../core/widgets';
import { Field } from './fields';

export type InputTab = 'piano' | 'guitar' | 'text';
const TABS: { id: InputTab; label: string }[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'guitar', label: 'Guitar' },
  { id: 'text', label: 'Type' },
];
const STORAGE_KEY = 'mn.inputMethod';

function loadTab(): InputTab {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'piano' || v === 'guitar' || v === 'text') return v;
  } catch {
    /* storage unavailable */
  }
  return 'piano';
}
function saveTab(t: InputTab) {
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* storage unavailable */
  }
}

/** The field of a widget that can be played in, if any. */
export function instrumentField(def: WidgetDefinition | undefined): FieldSpec | undefined {
  return def?.fields.find((f) => f.instrument);
}

/** A note picked on an instrument. On guitar it remembers its string. */
interface Pick {
  midi: number;
  string?: number;
}

const midiOf = (n: string) => Note.midi(n) ?? null;
const notNull = <T,>(x: T | null | undefined): x is T => x !== null && x !== undefined;

/** Tokens of a chord list, with their positions so edits keep bar lines and spacing. */
function chordTokens(text: string) {
  return [...text.matchAll(/[^\s,|]+/g)].map((m) => ({ text: m[0], start: m.index!, end: m.index! + m[0].length }));
}

function defaultOctave(b: InstrumentBinding, values: WidgetValues) {
  const fallback = b.mode === 'chord' || b.mode === 'chords' ? 3 : 4;
  return parseInt((b.octave && values[b.octave]) || String(fallback), 10) || fallback;
}

function picksFromFrets(frets: Frets, tuning: Tuning): Pick[] {
  return frets
    .map((f, s) => (f === null ? null : { midi: Note.midi(tuning.notes[s])! + f, string: s }))
    .filter(notNull);
}

/** Lay notes out on the fretboard, keeping their order. */
function picksOnGuitar(midis: number[], tuning: Tuning): Pick[] | null {
  const frets = fitToStrings(midis, tuning);
  if (!frets) return null;
  const placed = picksFromFrets(frets, tuning);
  return midis.map((m) => placed.find((p) => p.midi === m)).filter(notNull);
}

interface Derived {
  picks: Pick[];
  /** Explains why the current value couldn't be shown */
  note?: string;
}

/** Turn the current field value into picks on the given instrument. */
function derive(tab: InputTab, field: FieldSpec, values: WidgetValues, slot: number | 'new'): Derived {
  const b = field.instrument!;
  const value = values[field.key] ?? '';
  const tuning = getTuning(values.tuning);
  const octave = defaultOctave(b, values);
  let symbol: string | null = null;
  let midis: number[] = [];

  if (b.mode === 'note') {
    const n = parseNote(value);
    if (n) midis = [n.midi ?? midiOf(`${n.pc}4`)!];
  } else if (b.mode === 'chord') {
    symbol = value;
  } else if (b.mode === 'chords') {
    if (slot === 'new') return { picks: [] };
    const step = parseProgression(value, values.key, octave)[slot];
    if (!step?.symbol) return { picks: [] };
    symbol = step.symbol;
  } else {
    midis = resolveNotes(value, octave).map(midiOf).filter(notNull);
  }

  if (symbol !== null) {
    if (tab === 'guitar') {
      const own = b.frets && values[b.frets] ? parseFrets(values[b.frets], tuning.notes.length) : null;
      const frets = own ?? guitarVoicing(symbol, tuning)?.frets;
      return frets ? { picks: picksFromFrets(frets, tuning) } : { picks: [], note: symbol ? `No guitar shape found for ${prettyAccidentals(symbol)}` : undefined };
    }
    midis = voiceChord(symbol, octave).map(midiOf).filter(notNull);
  }

  if (tab === 'guitar') {
    const picks = picksOnGuitar(midis, tuning);
    return picks ? { picks } : { picks: [], note: "These notes can't all be played at once on guitar" };
  }
  return { picks: midis.map((midi) => ({ midi })) };
}

export function InstrumentPanel({
  field,
  values,
  onChange,
}: {
  field: FieldSpec;
  values: WidgetValues;
  onChange(values: WidgetValues): void;
}) {
  const b = field.instrument!;
  const [tab, setTabState] = useState<InputTab>(loadTab);
  const [slot, setSlot] = useState<number | 'new'>('new');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [derivedNote, setDerivedNote] = useState<string | undefined>();
  /** True once notes have been played here; false while showing the stored value */
  const [edited, setEdited] = useState(false);
  const value = values[field.key] ?? '';
  const tuning = getTuning(values.tuning);
  const tokens = b.mode === 'chords' ? chordTokens(value) : [];
  const slotIndex = typeof slot === 'number' && slot < tokens.length ? slot : 'new';

  const setTab = (t: InputTab) => {
    setTabState(t);
    saveTab(t);
  };

  // Re-read the value when it changes from outside the instrument (typing,
  // switching tabs, picking another chord in a progression), but not after
  // our own edits, so the notes you played stay exactly as you played them.
  const keyFor = (v: WidgetValues, t: InputTab, s: number | 'new') =>
    JSON.stringify([t, s, v[field.key] ?? '', b.frets ? v[b.frets] : '', v.tuning, b.octave ? v[b.octave] : '', v.key]);
  const sourceKey = keyFor(values, tab, slotIndex);
  const ownKey = useRef<string | null>(null);
  useEffect(() => {
    if (sourceKey === ownKey.current) return;
    ownKey.current = sourceKey;
    if (tab === 'text') return;
    const d = derive(tab, field, values, slotIndex);
    setPicks(d.picks);
    setDerivedNote(d.note);
    setEdited(false);
  }, [sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: WidgetValues) => {
    ownKey.current = keyFor(next, tab, slotIndex);
    onChange(next);
  };

  const ordered = (ps: Pick[]) => (b.mode === 'sequence' || b.mode === 'interval' ? ps : [...ps].sort((x, y) => x.midi - y.midi));
  const midis = ordered(picks).map((p) => p.midi);
  const chordNames = b.mode === 'chord' || b.mode === 'chords' || b.mode === 'notes' || b.mode === 'sequence' ? detectChords(midis) : [];
  const storedSymbol = b.mode === 'chord' ? value : b.mode === 'chords' && slotIndex !== 'new' ? tokens[slotIndex].text : null;
  // Show the stored name while it still describes what's on the instrument.
  const shownSymbol =
    storedSymbol && parseChord(storedSymbol) && (chordNames.includes(storedSymbol) || !edited) ? storedSymbol : chordNames[0] ?? null;
  const spelled = spellNotes(midis, shownSymbol ?? undefined);
  const spell = (m: number) => spelled[midis.indexOf(m)] ?? friendlyNote(m);

  const fretsOf = (ps: Pick[]): Frets => tuning.notes.map((_, s) => {
    const p = ps.find((x) => x.string === s);
    return p ? p.midi - Note.midi(tuning.notes[s])! : null;
  });

  /** Values for a chord symbol named from these picks. */
  const chordValues = (ps: Pick[], symbol: string): WidgetValues => {
    const next: WidgetValues = { ...values, [field.key]: symbol };
    if (b.frets) {
      if (tab === 'guitar') {
        const frets = formatFrets(fretsOf(ps));
        const auto = guitarVoicing(symbol, tuning);
        next[b.frets] = auto && formatFrets(auto.frets) === frets ? '' : frets;
      } else next[b.frets] = '';
    }
    if (b.octave) {
      // Voice the chord where it was played, so it sounds the same later.
      const c = parseChord(symbol);
      const rootMidis = ps.map((p) => p.midi).filter((m) => c && m % 12 === Note.chroma(c.root));
      const low = rootMidis.length ? Math.min(...rootMidis) : Math.min(...ps.map((p) => p.midi));
      next[b.octave] = String(Math.max(1, Math.min(7, Math.floor(low / 12) - 1)));
    }
    return next;
  };

  const apply = (ps: Pick[]) => {
    setPicks(ps);
    setDerivedNote(undefined);
    setEdited(true);
    const list = spellNotes(ordered(ps).map((p) => p.midi));
    switch (b.mode) {
      case 'note':
        if (list.length) commit({ ...values, [field.key]: list[0] });
        return;
      case 'notes':
      case 'sequence':
      case 'interval':
        commit({ ...values, [field.key]: list.join(' ') });
        return;
      case 'chord': {
        const names = detectChords(ps.map((p) => p.midi));
        if (!names.length) return;
        commit(chordValues(ps, names.includes(value) ? value : names[0]));
        return;
      }
      case 'chords': {
        const names = detectChords(ps.map((p) => p.midi));
        if (!names.length || slotIndex === 'new') return;
        const t = tokens[slotIndex];
        commit({ ...values, [field.key]: value.slice(0, t.start) + names[0] + value.slice(t.end) });
        return;
      }
    }
  };

  const audio = getAudioEngine();
  const sound = values.sound && values.sound !== 'document' ? values.sound : tab === 'guitar' ? 'guitar' : 'piano';
  const hear = (ms: number[]) => {
    if (!ms.length) return;
    const names = ms.map((m) => Note.fromMidi(m));
    if (b.mode === 'sequence' || b.mode === 'interval') {
      const step = 0.42;
      audio.sequence(
        names.map((n, i) => ({ time: i * step, notes: [n], duration: step * 1.6 })),
        { instrument: sound },
      );
    } else {
      audio.play([...names].sort((x, y) => Note.midi(x)! - Note.midi(y)!), { instrument: sound, duration: 1.8, strum: tab === 'guitar' ? 0.035 : 0.01 });
    }
  };

  const limit = (ps: Pick[]) => (b.mode === 'interval' && ps.length > 2 ? ps.slice(ps.length - 2) : ps);

  const onKey = (midi: number) => {
    audio.play([Note.fromMidi(midi)], { instrument: sound, duration: 1 });
    if (b.mode === 'note') return apply([{ midi }]);
    const has = picks.some((p) => p.midi === midi);
    apply(limit(has ? picks.filter((p) => p.midi !== midi) : [...picks, { midi }]));
  };

  const onFret = (string: number, fret: number) => {
    const midi = Note.midi(tuning.notes[string])! + fret;
    if (b.mode === 'note') {
      audio.play([Note.fromMidi(midi)], { instrument: sound, duration: 1.2 });
      return apply([{ midi, string }]);
    }
    const same = picks.find((p) => p.string === string && p.midi === midi);
    const others = picks.filter((p) => p.string !== string);
    if (same) return apply(others);
    audio.play([Note.fromMidi(midi)], { instrument: sound, duration: 1.2 });
    apply(limit([...others, { midi, string }]));
  };

  const addChord = (symbol = chordNames[0]) => {
    if (!symbol) return;
    const trimmed = value.replace(/\s+$/, '');
    commit({ ...values, [field.key]: `${trimmed}${trimmed ? ' ' : ''}${symbol}` });
    setPicks([]);
    setEdited(false);
  };

  const removeChord = (i: number) => {
    const t = tokens[i];
    const next = (value.slice(0, t.start) + value.slice(t.end)).replace(/\s{2,}/g, ' ').trim();
    setSlot('new');
    onChange({ ...values, [field.key]: next });
  };

  return (
    <section className="instrument-panel" aria-label={`${field.label}: play or type`}>
      <div className="instrument-head">
        <div className="segmented instrument-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="instrument-title">{field.label}</div>
        {tab !== 'text' && (
          <div className="instrument-actions">
            <button type="button" className="button button-small" onClick={() => apply([])} disabled={!picks.length}>
              Clear
            </button>
            <button type="button" className="button button-small" onClick={() => hear(midis)} disabled={!picks.length}>
              Hear it
            </button>
          </div>
        )}
      </div>

      {b.mode === 'chords' && tab !== 'text' && (
        <div className="instrument-slots">
          {tokens.map((t, i) => (
            <span key={`${i}-${t.text}`} className={`instrument-slot${slotIndex === i ? ' is-on' : ''}`}>
              <button type="button" onClick={() => setSlot(i)} title="Edit this chord">
                {prettyAccidentals(t.text)}
              </button>
              <button type="button" className="instrument-slot-remove" onClick={() => removeChord(i)} aria-label={`Remove ${t.text}`}>
                ×
              </button>
            </span>
          ))}
          <span className={`instrument-slot is-new${slotIndex === 'new' ? ' is-on' : ''}`}>
            <button type="button" onClick={() => setSlot('new')}>
              ＋ New chord
            </button>
          </span>
        </div>
      )}

      {tab === 'text' ? (
        <div className="instrument-text">
          <Field field={field} value={value} values={values} onChange={(v) => onChange({ ...values, [field.key]: v })} autoFocus />
          {field.help && <div className="form-help">{field.help}</div>}
        </div>
      ) : (
        <>
          {tab === 'piano' ? (
            <PianoInput picks={midis} spell={spell} onKey={onKey} />
          ) : (
            <FretboardInput picks={picks} spell={spell} tuning={tuning} onFret={onFret} />
          )}
          <Readout
            mode={b.mode}
            midis={midis}
            symbol={shownSymbol}
            spell={spell}
            chordNames={chordNames}
            note={derivedNote}
            isNewSlot={slotIndex === 'new'}
            onAdd={addChord}
          />
        </>
      )}
    </section>
  );
}

function Readout({
  mode,
  midis,
  symbol,
  spell,
  chordNames,
  note,
  isNewSlot,
  onAdd,
}: {
  mode: InstrumentBinding['mode'];
  midis: number[];
  /** The chord name to show */
  symbol: string | null;
  spell(midi: number): string;
  chordNames: string[];
  note?: string;
  isNewSlot: boolean;
  onAdd(): void;
}) {
  const names = midis.map((m) => displayNote(spell(m)));
  const pcs = midis.map((m) => displayNote(spell(m), { octave: false }));
  const empty = !midis.length;
  const hint = (text: string) => <span className="instrument-hint">{text}</span>;
  let body: React.ReactNode;

  if (note && empty) body = hint(note);
  else if (mode === 'note') {
    body = empty ? hint('Click a key or a fret to choose a note.') : <strong className="instrument-name">{names[0]}</strong>;
  } else if (mode === 'interval') {
    const info = midis.length === 2 ? intervalBetween(spell(midis[0]), spell(midis[1])) : null;
    body = empty ? (
      hint('Click two notes: the first one, then the second.')
    ) : (
      <>
        <strong className="instrument-name">{names.join(' → ')}</strong>
        {info ? hint(info.long) : hint('Now pick the second note.')}
      </>
    );
  } else if (mode === 'notes' || mode === 'sequence') {
    body = empty ? (
      hint(mode === 'sequence' ? 'Click notes in the order you want them played. Click again to remove one.' : 'Click keys or frets to add notes. Click again to remove one.')
    ) : (
      <strong className="instrument-name">{names.join('  ')}</strong>
    );
  } else {
    // chord / chords
    const current = symbol;
    body = empty ? (
      hint(mode === 'chords' && isNewSlot ? 'Play a chord, then add it to the progression.' : 'Play the notes of a chord and it will be named for you.')
    ) : !current ? (
      <>
        <strong className="instrument-name is-muted">{pcs.join(' ')}</strong>
        {hint(midis.length < 3 && new Set(pcs).size < 3 ? 'Add another note to make a chord.' : "That's not a chord I can name. Try adding or removing a note.")}
      </>
    ) : (
      <strong className="instrument-name">{prettyAccidentals(current)}</strong>
    );
  }

  return (
    <div className="instrument-readout">
      <div className="instrument-readout-main">{body}</div>
      {mode === 'chords' && isNewSlot && (
        <button type="button" className="button button-small button-primary" onClick={() => onAdd()} disabled={!chordNames.length}>
          Add {chordNames[0] ? prettyAccidentals(chordNames[0]) : 'chord'}
        </button>
      )}
    </div>
  );
}

/* ---------- Piano ---------- */

const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = (m: number) => BLACK.has(((m % 12) + 12) % 12);
const OCTAVES = 3;
const LOWEST_C = 24;
const HIGHEST_C = 84;

function PianoInput({ picks, spell, onKey }: { picks: number[]; spell(midi: number): string; onKey(midi: number): void }) {
  const [low, setLow] = useState(48);
  // Keep what you've picked in view when the notes come from elsewhere.
  const picksKey = picks.join(',');
  useEffect(() => {
    if (!picks.length) return;
    const lo = Math.min(...picks);
    const hi = Math.max(...picks);
    if (lo >= low && hi <= low + OCTAVES * 12) return;
    setLow(Math.max(LOWEST_C, Math.min(HIGHEST_C - OCTAVES * 12, lo - (lo % 12))));
  }, [picksKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const high = low + OCTAVES * 12;
  const picked = new Set(picks);
  const W = 30;
  const H = 120;
  const BW = 18;
  const BH = 74;
  const whites: number[] = [];
  for (let m = low; m <= high; m++) if (!isBlack(m)) whites.push(m);
  const width = whites.length * W;

  const keys: React.ReactNode[] = [];
  const blacks: React.ReactNode[] = [];
  let x = 0;
  for (let m = low; m <= high; m++) {
    const on = picked.has(m);
    const label = on ? displayNote(spell(m), { octave: false }) : '';
    if (!isBlack(m)) {
      keys.push(
        <g key={m} className={`ii-key ii-key-white${on ? ' is-on' : ''}`} onMouseDown={(e) => (e.preventDefault(), onKey(m))}>
          <rect x={x + 0.5} y={0.5} width={W - 1} height={H} rx={4} />
          {on ? (
            <>
              <circle className="ii-key-dot" cx={x + W / 2} cy={H - 18} r={11} />
              <text className="ii-key-dot-label" x={x + W / 2} y={H - 18}>
                {label}
              </text>
            </>
          ) : (
            m % 12 === 0 && (
              <text className="ii-key-c" x={x + W / 2} y={H - 10}>
                C{Math.floor(m / 12) - 1}
              </text>
            )
          )}
        </g>,
      );
      x += W;
    } else {
      const bx = x - BW / 2;
      blacks.push(
        <g key={m} className={`ii-key ii-key-black${on ? ' is-on' : ''}`} onMouseDown={(e) => (e.preventDefault(), onKey(m))}>
          <rect x={bx} y={0.5} width={BW} height={BH} rx={3} />
          {on && (
            <>
              <circle className="ii-key-dot" cx={bx + BW / 2} cy={BH - 14} r={8} />
              <text className="ii-key-dot-label is-small" x={bx + BW / 2} y={BH - 14}>
                {label}
              </text>
            </>
          )}
        </g>,
      );
    }
  }

  return (
    <div className="ii-piano">
      <button type="button" className="ii-shift" onClick={() => setLow((l) => Math.max(LOWEST_C, l - 12))} disabled={low <= LOWEST_C} aria-label="Lower octave" title="Lower octave">
        ‹
      </button>
      <svg className="ii-piano-svg" viewBox={`0 0 ${width + 1} ${H + 1}`} role="group" aria-label="Piano keys">
        {keys}
        {blacks}
      </svg>
      <button
        type="button"
        className="ii-shift"
        onClick={() => setLow((l) => Math.min(HIGHEST_C - OCTAVES * 12, l + 12))}
        disabled={low >= HIGHEST_C - OCTAVES * 12}
        aria-label="Higher octave"
        title="Higher octave"
      >
        ›
      </button>
    </div>
  );
}

/* ---------- Guitar ---------- */

const INLAYS = [3, 5, 7, 9, 15];

function FretboardInput({
  picks,
  spell,
  tuning,
  onFret,
}: {
  picks: Pick[];
  spell(midi: number): string;
  tuning: Tuning;
  onFret(string: number, fret: number): void;
}) {
  const strings = tuning.notes.length;
  const open = useMemo(() => tuning.notes.map((n) => Note.midi(n)!), [tuning]);
  const LW = 24; // string names
  const OW = 40; // open-string column
  const FW = 46;
  const SY = 24;
  const top = 14;
  const boardH = SY * (strings - 1);
  const width = LW + OW + FW * MAX_FRET + 6;
  const height = top + boardH + 34;
  const nutX = LW + OW;
  // High string at the top, like looking down at the neck (and like tab).
  const yOf = (s: number) => top + (strings - 1 - s) * SY;
  const xOf = (f: number) => (f === 0 ? LW + OW / 2 : nutX + (f - 0.5) * FW);
  const used = new Set(picks.map((p) => p.string));

  const cells: React.ReactNode[] = [];
  for (let s = 0; s < strings; s++) {
    for (let f = 0; f <= MAX_FRET; f++) {
      const x = f === 0 ? LW : nutX + (f - 1) * FW;
      const w = f === 0 ? OW : FW;
      cells.push(
        <g key={`${s}-${f}`} className="ii-cell" onMouseDown={(e) => (e.preventDefault(), onFret(s, f))}>
          <rect x={x} y={yOf(s) - SY / 2} width={w} height={SY} fill="transparent" />
          <circle className="ii-cell-hover" cx={xOf(f)} cy={yOf(s)} r={8} />
        </g>,
      );
    }
  }

  return (
    <div className="ii-guitar">
      <svg className="ii-guitar-svg" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Guitar fretboard">
        {INLAYS.map((f) => (
          <circle key={f} className="ii-inlay" cx={nutX + (f - 0.5) * FW} cy={top + boardH / 2} r={5} />
        ))}
        <circle className="ii-inlay" cx={nutX + 11.5 * FW} cy={top + boardH / 2 - SY} r={5} />
        <circle className="ii-inlay" cx={nutX + 11.5 * FW} cy={top + boardH / 2 + SY} r={5} />
        {Array.from({ length: MAX_FRET }, (_, i) => (
          <line key={i} className="ii-fret" x1={nutX + (i + 1) * FW} x2={nutX + (i + 1) * FW} y1={top - 4} y2={top + boardH + 4} />
        ))}
        <line className="ii-nut" x1={nutX} x2={nutX} y1={top - 5} y2={top + boardH + 5} />
        {tuning.notes.map((n, s) => (
          <g key={s} className={used.has(s) ? 'is-used' : 'is-unused'}>
            <text className="ii-string-name" x={LW / 2} y={yOf(s)}>
              {displayNote(n, { octave: false })}
            </text>
            <line className="ii-string" x1={nutX} x2={width - 6} y1={yOf(s)} y2={yOf(s)} strokeWidth={0.8 + (strings - 1 - s) * 0.22} />
            {picks.length > 0 && !used.has(s) && (
              <text className="ii-muted" x={LW + OW / 2} y={yOf(s)}>
                ×
              </text>
            )}
          </g>
        ))}
        {Array.from({ length: MAX_FRET }, (_, i) => (
          <text key={i} className={`ii-fret-num${INLAYS.includes(i + 1) || i + 1 === 12 ? ' is-marked' : ''}`} x={nutX + (i + 0.5) * FW} y={top + boardH + 22}>
            {i + 1}
          </text>
        ))}
        <text className="ii-fret-num" x={LW + OW / 2} y={top + boardH + 22}>
          open
        </text>
        {cells}
        {picks.map((p) => {
          if (p.string === undefined) return null;
          const f = p.midi - open[p.string];
          return (
            <g key={`${p.string}-${f}`} className={`ii-pick${f === 0 ? ' is-open' : ''}`} pointerEvents="none">
              <circle cx={xOf(f)} cy={yOf(p.string)} r={10} />
              <text x={xOf(f)} y={yOf(p.string)}>
                {displayNote(spell(p.midi), { octave: false })}
              </text>
            </g>
          );
        })}
      </svg>
      {tuning.id !== 'standard' && <div className="ii-guitar-hint">{tuning.label}</div>}
    </div>
  );
}
