import { describe, expect, it } from 'vitest';
import { parseMarkdown, serializeMarkdown } from '../src/editor/markdown';
import { joinFrontmatter, splitFrontmatter, deriveTitle, deriveExcerpt, parseAttrs } from '../src/core/markdown';
import { renderBodyHtml } from '../src/core/publish';

const roundTrip = (md: string) => serializeMarkdown(parseMarkdown(md));

describe('directives', () => {
  it('parses attrs', () => {
    expect(parseAttrs('{a=1 b="two words" c=\'x\' flag}', 0)?.attrs).toEqual({ a: '1', b: 'two words', c: 'x', flag: 'true' });
  });
  it('round-trips inline and block widgets', () => {
    const src = [
      '# Title',
      '',
      'Play :note[C#4] then :chord[Cmaj7]{octave=4} and :notes[C E G]{chord}.',
      '',
      '::scale{root=D mode=dorian octave=4}',
      '',
      '::progression[ii7 V7 Imaj7]{key=C beats=2}',
      '',
      '::guitar[Am7]',
      '',
    ].join('\n');
    expect(roundTrip(src)).toBe(src);
  });
  it('keeps unknown widgets and attributes', () => {
    const src = '::future-thing{x=1 y="a b"}\n\nText :mystery[abc]{z=2} here.\n';
    expect(roundTrip(src)).toBe(src);
  });
  it('escapes literal directive-looking text', () => {
    const doc = parseMarkdown('Escaped \\:note[C4] stays text.\n');
    expect(doc.firstChild!.childCount).toBe(1);
    const once = roundTrip('Escaped \\:note[C4] and :x{y=1} stays text.\n'.replace(':x{', '\\:x{'));
    expect(roundTrip(once)).toBe(once);
    expect(parseMarkdown(once).firstChild!.childCount).toBe(1);
  });
  it('does not treat times or urls as directives', () => {
    const doc = parseMarkdown('Meet at 10:30[ish] or http://x.com\n');
    expect(doc.firstChild!.childCount).toBe(1);
  });
});

describe('markdown round trip', () => {
  it('preserves common markdown', () => {
    const src = [
      '## Heading',
      '',
      'Some *em*, **strong**, ~~strike~~, `code` and a [link](https://example.com).',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      '> quoted',
      '',
      '```js',
      'const x = 1;',
      '```',
      '',
      '![alt](assets/pic.png)',
      '',
      '---',
      '',
      'End.',
      '',
    ].join('\n');
    expect(roundTrip(src)).toBe(src);
  });
});

describe('frontmatter', () => {
  it('splits and joins', () => {
    const doc = '---\ntitle: Hi\nsound: epiano\ntempo: 80\n---\n\n# Body\n';
    const { settings, body } = splitFrontmatter(doc);
    expect(settings).toEqual({ title: 'Hi', sound: 'epiano', tempo: 80 });
    expect(body).toBe('# Body\n');
    expect(joinFrontmatter(settings, body)).toBe(doc);
    expect(joinFrontmatter({}, body)).toBe(body);
  });
  it('derives title and excerpt', () => {
    const doc = '# Blue Song\n\nA tune about :chord[Dm7] things.\n\nMore.';
    expect(deriveTitle(doc)).toBe('Blue Song');
    expect(deriveExcerpt(doc)).toBe('A tune about Dm7 things.');
  });
});

describe('publish', () => {
  it('renders widget placeholders', () => {
    const html = renderBodyHtml('Hear :note[C4].\n\n::scale{root=D mode=dorian}\n\n```js\nlet a = 1\n```\n');
    expect(html).toContain('data-widget="note"');
    expect(html).toContain('data-widget="scale"');
    expect(html).toContain('&quot;mode&quot;:&quot;dorian&quot;');
    expect(html).toContain('hljs-keyword');
  });
});
