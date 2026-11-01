import { useEffect, useRef } from 'react';
import { WIDGETS, type WidgetDefinition } from '../../core/widgets';
import { WidgetIcon } from './icons';

export function filterWidgets(query: string): WidgetDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return WIDGETS;
  return WIDGETS.filter((w) => w.name.includes(q) || w.title.toLowerCase().includes(q) || w.description.toLowerCase().includes(q));
}

interface Props {
  items: WidgetDefinition[];
  active: number;
  onHover(i: number): void;
  onPick(name: string): void;
  style?: React.CSSProperties;
  className?: string;
}

export function WidgetMenu({ items, active, onHover, onPick, style, className }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const groups: { label: string; items: { w: WidgetDefinition; i: number }[] }[] = [
    { label: 'In a sentence', items: [] },
    { label: 'Blocks', items: [] },
  ];
  items.forEach((w, i) => groups[w.kind === 'inline' ? 0 : 1].items.push({ w, i }));
  return (
    <div className={`widget-menu ${className ?? ''}`} style={style} ref={listRef} role="listbox" onMouseDown={(e) => e.preventDefault()}>
      {items.length === 0 && <div className="widget-menu-empty">No matching widgets</div>}
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.label} className="widget-menu-group">
            <div className="widget-menu-label">{g.label}</div>
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
