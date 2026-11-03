import { WIDGETS, type WidgetDefinition } from '../../core/widgets';

/** Anything the insert menu can list: widgets, plus built-in blocks like tables. */
export type InsertItem = Pick<WidgetDefinition, 'name' | 'title' | 'description' | 'kind' | 'icon'>;

const TABLE_ICON =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M2.5 8h15M2.5 12.25h15M8 8v8.5M12.5 8v8.5"/></svg>';

export const TABLE_ITEM: InsertItem = {
  name: 'table',
  title: 'Table',
  description: 'Rows and columns, written as a markdown table',
  kind: 'block',
  icon: TABLE_ICON,
};

/** Everything in the insert menu, in display order. */
export const INSERT_ITEMS: InsertItem[] = [...WIDGETS, TABLE_ITEM];

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

function scoreToken(w: InsertItem, token: string): number {
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
function scoreWord(w: InsertItem, token: string): number {
  const score = scoreToken(w, token);
  if (token.length <= 3 || !token.endsWith('s')) return score;
  // Just below the literal match, so "notes" still puts Notes ahead of Note.
  return Math.max(score, scoreToken(w, token.slice(0, -1)) - 1);
}

/**
 * Items matching `query`, best match first; ties keep registry order. Every word
 * of the query has to match, and an empty query returns every item in order.
 */
export function filterWidgets<T extends InsertItem = WidgetDefinition>(query: string, items: T[] = WIDGETS as unknown as T[]): T[] {
  const tokens = words(query);
  if (!tokens.length) return items;
  return items.map((widget) => {
    const scores = tokens.map((token) => scoreWord(widget, token));
    return { widget, score: scores.includes(0) ? 0 : scores.reduce((a, b) => a + b, 0) };
  })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((m) => m.widget);
}
