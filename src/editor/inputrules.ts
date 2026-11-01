import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
  undoInputRule,
} from 'prosemirror-inputrules';
import type { MarkType, Schema } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { getWidget, valuesFromDirective } from '../core/widgets';
import { parseDirectiveAt } from '../core/markdown';

/** Wrap text matched by `re` (capture group 1) in a mark, removing delimiters. */
function markRule(re: RegExp, type: MarkType): InputRule {
  return new InputRule(re, (state, match, start, end) => {
    const inner = match[1];
    const full = match[0];
    const tr = state.tr;
    const textStart = start + full.indexOf(inner);
    const textEnd = textStart + inner.length;
    if (textEnd < end) tr.delete(textEnd, end);
    if (textStart > start) tr.delete(start, textStart);
    tr.addMark(start, start + inner.length, type.create());
    tr.removeStoredMark(type);
    return tr;
  });
}

export { undoInputRule };

export function buildInputRules(schema: Schema) {
  const n = schema.nodes;
  const m = schema.marks;
  const rules: InputRule[] = [
    textblockTypeInputRule(/^(#{1,6})\s$/, n.heading, (match) => ({ level: match[1].length })),
    wrappingInputRule(/^\s*>\s$/, n.blockquote),
    wrappingInputRule(/^\s*([-+*])\s$/, n.bullet_list),
    wrappingInputRule(
      /^(\d+)\.\s$/,
      n.ordered_list,
      (match) => ({ order: +match[1] }),
      (match, node) => node.childCount + node.attrs.order === +match[1],
    ),
    textblockTypeInputRule(/^```([\w+#-]*)\s$/, n.code_block, (match) => ({ params: match[1] })),
    new InputRule(/^(?:---|\*\*\*|___)$/, (state, _match, start) => {
      const $start = state.doc.resolve(start);
      if ($start.parent.type !== n.paragraph || $start.depth !== 1) return null;
      const tr = state.tr.replaceRangeWith($start.before(), $start.after(), n.horizontal_rule.create());
      const after = tr.mapping.map($start.after());
      tr.insert(after, n.paragraph.create());
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
      return tr;
    }),
    markRule(/(?<![*\w])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, m.strong),
    markRule(/(?<![_\w])__([^_\s](?:[^_]*[^_\s])?)__$/, m.strong),
    markRule(/(?<![*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, m.em),
    markRule(/(?<![_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, m.em),
    markRule(/(?<!`)`([^`]+)`$/, m.code),
    markRule(/~~([^~\s](?:[^~]*[^~\s])?)~~$/, m.strike),
    // [text](url)
    new InputRule(/\[([^\]]+)\]\(([^)\s]+)\)$/, (state, match, start, end) => {
      const [, text, href] = match;
      const tr = state.tr.replaceWith(start, end, schema.text(text, [m.link.create({ href })]));
      tr.removeStoredMark(m.link);
      return tr;
    }),
    // Typing an inline directive by hand turns it into a widget: :note[C4]
    new InputRule(/(?<![\w:\\]):([a-z][a-z0-9-]*\[[^\]\n]*\](?:\{[^}\n]*\})?)$/, (state, match, start, end) => {
      // `end` excludes the char just typed; the regex includes it
      const parsed = parseDirectiveAt(match[1], 0);
      if (!parsed || parsed.end !== match[1].length) return null;
      const def = getWidget(parsed.directive.name);
      if (!def || def.kind !== 'inline') return null;
      const node = n.widget_inline.create({ name: def.name, values: valuesFromDirective(parsed.directive) });
      return state.tr.replaceWith(start, end, node);
    }),
  ];
  return inputRules({ rules });
}
