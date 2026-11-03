import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TableAction, TableAxis } from '../../editor';

interface Props {
  axis: TableAxis;
  index: number;
  rows: number;
  cols: number;
  /** Current alignment of the column (columns only) */
  align: 'left' | 'center' | 'right' | null;
  rect: DOMRect;
  onAction(action: TableAction): void;
  onClose(): void;
}

const ALIGN_ICONS = {
  left: 'M3 5h14M3 10h9M3 15h12',
  center: 'M3 5h14M5.5 10h9M4 15h12',
  right: 'M3 5h14M8 10h9M5 15h12',
} as const;

/** Menu for a table row or column, opened from its grip handle. */
export function TableMenu({ axis, index, rows, cols, align, rect, onAction, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: rect.left, top: rect.bottom + 4 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Rows: open beside the grip. Columns: open below it.
    let left = axis === 'row' ? rect.right + 4 : rect.left + rect.width / 2 - w / 2;
    let top = axis === 'row' ? rect.top : rect.bottom + 4;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    if (top + h > window.innerHeight - 8) top = Math.max(8, (axis === 'row' ? rect.bottom : rect.top - 4) - h);
    setPos({ left, top });
  }, [rect, axis]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const count = axis === 'row' ? rows : cols;
  const item = (label: string, action: TableAction, opts: { disabled?: boolean; danger?: boolean } = {}) => (
    <button
      type="button"
      className={`context-menu-item${opts.danger ? ' is-danger' : ''}`}
      disabled={opts.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onAction(action)}
    >
      {label}
    </button>
  );
  const sep = <div className="context-menu-sep" />;

  return (
    <div className="context-menu" ref={ref} style={pos} role="menu" onMouseDown={(e) => e.preventDefault()}>
      {axis === 'row' ? (
        <>
          {item(index === 0 ? 'Insert header above' : 'Insert row above', { type: 'insert', side: 'before' })}
          {item('Insert row below', { type: 'insert', side: 'after' })}
          {sep}
          {item('Move row up', { type: 'move', dir: -1 }, { disabled: index === 0 })}
          {item('Move row down', { type: 'move', dir: 1 }, { disabled: index >= count - 1 })}
          {sep}
          {item(count <= 1 ? 'Delete row (and table)' : 'Delete row', { type: 'delete' }, { danger: true })}
        </>
      ) : (
        <>
          <div className="context-menu-segmented" role="group" aria-label="Alignment">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                type="button"
                title={`Align ${a}`}
                className={align === a ? 'is-on' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onAction({ type: 'align', align: align === a ? null : a })}
              >
                <svg width={16} height={16} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                  <path d={ALIGN_ICONS[a]} />
                </svg>
              </button>
            ))}
          </div>
          {sep}
          {item('Insert column left', { type: 'insert', side: 'before' })}
          {item('Insert column right', { type: 'insert', side: 'after' })}
          {sep}
          {item('Move column left', { type: 'move', dir: -1 }, { disabled: index === 0 })}
          {item('Move column right', { type: 'move', dir: 1 }, { disabled: index >= count - 1 })}
          {sep}
          {item(count <= 1 ? 'Delete column (and table)' : 'Delete column', { type: 'delete' }, { danger: true })}
        </>
      )}
      {item('Delete table', { type: 'delete-table' }, { danger: true })}
    </div>
  );
}
