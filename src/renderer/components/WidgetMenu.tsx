import { useEffect, useRef } from 'react';
import { WidgetIcon } from './icons';
import type { InsertItem } from './widgetSearch';

interface Props {
  items: InsertItem[];
  /** Items are search results: show them in the given order instead of grouping by kind. */
  ranked?: boolean;
  active: number;
  onHover(i: number): void;
  onPick(name: string): void;
  style?: React.CSSProperties;
  className?: string;
}

export function WidgetMenu({ items, ranked, active, onHover, onPick, style, className }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const groups: { label: string; items: { w: InsertItem; i: number }[] }[] = ranked
    ? [{ label: '', items: [] }]
    : [
        { label: 'In a sentence', items: [] },
        { label: 'Blocks', items: [] },
      ];
  items.forEach((w, i) => groups[ranked || w.kind === 'inline' ? 0 : 1].items.push({ w, i }));
  return (
    <div className={`widget-menu ${className ?? ''}`} style={style} ref={listRef} role="listbox" onMouseDown={(e) => e.preventDefault()}>
      {items.length === 0 && <div className="widget-menu-empty">Nothing matches</div>}
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.label} className="widget-menu-group">
            {g.label && <div className="widget-menu-label">{g.label}</div>}
            {g.items.map(({ w, i }) => (
              <div
                key={w.name}
                role="option"
                aria-selected={i === active}
                className={`widget-menu-item${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(w.name)}
              >
                <WidgetIcon svg={w.icon} />
                <div className="widget-menu-text">
                  <div className="widget-menu-title">{w.title}</div>
                  <div className="widget-menu-desc">{w.description}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
