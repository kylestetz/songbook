import { chordLabel, parseChord, parseExplicitChord, prettyAccidentals, splitChordSymbol } from '../theory';
import { h } from './dom';

/**
 * Lead-sheet typography for a chord symbol: root at full size, a minor "m"
 * on the baseline, extensions raised, slash bass after.  Cm7♭5 -> C m ⁷♭⁵
 */
export function chordSymbolEl(symbol: string, cls = 'mn-chord-name'): HTMLElement {
  // A chord written as notes shows its label, typeset when it reads as a
  // chord name, or else its notes / label as plain text.
  const explicit = parseExplicitChord(symbol);
  if (explicit) {
    if (explicit.label && parseChord(explicit.label)) return chordSymbolEl(explicit.label, cls);
    return h('span', { class: `${cls} is-plain` }, h('span', { class: 'mn-chord-root' }, prettyAccidentals(chordLabel(symbol))));
  }
  const { root, suffix, bass } = splitChordSymbol(symbol);
  const minor = /^(m|min|-)(?!aj)/.exec(suffix);
  const quality = minor ? minor[0] : '';
  const ext = suffix.slice(quality.length);
  return h(
    'span',
    { class: cls },
    h('span', { class: 'mn-chord-root' }, prettyAccidentals(root)),
    quality ? h('span', { class: 'mn-chord-quality' }, quality) : '',
    ext ? h('span', { class: 'mn-chord-suffix' }, prettyAccidentals(ext)) : '',
    bass ? h('span', { class: 'mn-chord-bass' }, '/' + prettyAccidentals(bass)) : '',
  );
}
