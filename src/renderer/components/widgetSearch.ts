import { WIDGETS, type WidgetDefinition } from '../../core/widgets';

const SCORE = {
  exact: 100,
  prefix: 80,
  wordPrefix: 60,
  initials: 50,
  substring: 40,
  abbreviation: 30,
  description: 10,
};

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** "chrd" abbreviates "chord": same first letter, remaining letters in order. */
function abbreviates(token: string, word: string): boolean {
  if (token[0] !== word[0]) return false;
  let i = 0;
  for (const c of word) if (c === token[i]) i++;
  return i === token.length;
}

function scoreToken(w: WidgetDefinition, token: string): number {
  const title = w.title.toLowerCase();
  const titleWords = words(title);
  if (token === w.name || token === title) return SCORE.exact;
  if (w.name.startsWith(token) || title.startsWith(token)) return SCORE.prefix;
  if (titleWords.some((word) => word.startsWith(token))) return SCORE.wordPrefix;
  // Single letters only count at the start of a word; anywhere else they match nearly everything.
  if (token.length < 2) return 0;
  if (titleWords.map((word) => word[0]).join('').startsWith(token)) return SCORE.initials;
  if (w.name.includes(token) || title.includes(token)) return SCORE.substring;
  if (token.length >= 3 && titleWords.some((word) => abbreviates(token, word))) return SCORE.abbreviation;
  if (words(w.description).some((word) => word.startsWith(token))) return SCORE.description;
  return 0;
}

/** Scores a token, also trying its singular so "chords" finds "Chord symbol". */
function scoreWord(w: WidgetDefinition, token: string): number {
  const score = scoreToken(w, token);
  if (token.length <= 3 || !token.endsWith('s')) return score;
  // Just below the literal match, so "notes" still puts Notes ahead of Note.
  return Math.max(score, scoreToken(w, token.slice(0, -1)) - 1);
}

/**
 * Widgets matching `query`, best match first; ties keep registry order. Every word
 * of the query has to match, and an empty query returns the whole registry in order.
 */
export function filterWidgets(query: string): WidgetDefinition[] {
  const tokens = words(query);
  if (!tokens.length) return WIDGETS;
  return WIDGETS.map((widget) => {
    const scores = tokens.map((token) => scoreWord(widget, token));
    return { widget, score: scores.includes(0) ? 0 : scores.reduce((a, b) => a + b, 0) };
  })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((m) => m.widget);
}
