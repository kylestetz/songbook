import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EditorHandle } from '../../editor';
import { IconLink } from './icons';

interface Props {
  editor: EditorHandle;
  rect: DOMRect;
  marks: Set<string>;
  onLink(): void;
}

/** Floating formatting bar shown over a text selection. */
export function SelectionToolbar({ editor, rect, marks, onLink }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: rect.left, top: rect.top - 44 });
  useLayoutEffect(() => {
    const w = ref.current?.offsetWidth ?? 220;
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, rect.left + rect.width / 2 - w / 2));
    const top = rect.top - 44 < 56 ? rect.bottom + 8 : rect.top - 44;
    setPos({ left, top });
  }, [rect]);
  const btn = (label: React.ReactNode, title: string, active: boolean, fn: () => void, cls = '') => (
    <button type="button" className={`fmt-btn ${cls}${active ? ' is-on' : ''}`} title={title} onMouseDown={(e) => e.preventDefault()} onClick={fn}>
      {label}
    </button>
  );
  return (
    <div className="selection-toolbar" ref={ref} style={{ left: pos.left, top: pos.top }}>
      {btn(<b>B</b>, 'Bold (⌘B)', marks.has('strong'), () => editor.toggleMark('strong'))}
      {btn(<i>I</i>, 'Italic (⌘I)', marks.has('em'), () => editor.toggleMark('em'))}
      {btn(<s>S</s>, 'Strikethrough', marks.has('strike'), () => editor.toggleMark('strike'))}
      {btn(<code>{'<>'}</code>, 'Code (⌘E)', marks.has('code'), () => editor.toggleMark('code'))}
      {btn(<IconLink width={15} height={15} />, 'Link (⌘K)', marks.has('link'), onLink)}
      <span className="fmt-sep" />
      {btn('H1', 'Heading 1', false, () => editor.setBlock('heading', 1), 'fmt-text')}
      {btn('H2', 'Heading 2', false, () => editor.setBlock('heading', 2), 'fmt-text')}
      {btn('H3', 'Heading 3', false, () => editor.setBlock('heading', 3), 'fmt-text')}
    </div>
  );
}

interface LinkProps {
  initial: string;
  rect: DOMRect;
  onSubmit(href: string | null): void;
  onClose(): void;
}

export function LinkPopover({ initial, rect, onSubmit, onClose }: LinkProps) {
  const [href, setHref] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [onClose]);
  const left = Math.max(12, Math.min(window.innerWidth - 332, rect.left));
  return (
    <div className="popover link-popover" ref={ref} style={{ left, top: rect.bottom + 8 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = href.trim();
          onSubmit(v ? (/^[a-z]+:|^#|^\//i.test(v) ? v : `https://${v}`) : null);
        }}
      >
        <input
          className="input"
          autoFocus
          placeholder="Paste or type a link"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />
        <div className="link-popover-actions">
          {initial && (
            <button type="button" className="button button-small" onClick={() => onSubmit(null)}>
              Remove link
            </button>
          )}
          <button type="submit" className="button button-small button-primary">
            Apply
          </button>
        </div>
      </form>
    </div>
  );
}
