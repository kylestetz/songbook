import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getWidget, renderWidget, type WidgetContext, type WidgetValues } from '../../core/widgets';
import { Field } from './fields';
import { IconChevron, IconClose, WidgetIcon } from './icons';
import { InstrumentPanel, instrumentField } from './InstrumentInput';

export function WidgetForm({
  name,
  values,
  onChange,
  compact,
  exclude,
}: {
  name: string;
  values: WidgetValues;
  onChange(values: WidgetValues): void;
  compact?: boolean;
  /** Field rendered elsewhere (the instrument panel) */
  exclude?: string;
}) {
  const def = getWidget(name);
  const [showMore, setShowMore] = useState(false);
  if (!def) return <div className="field-hint is-error">Unknown widget “{name}”</div>;
  const visible = def.fields.filter((f) => f.key !== exclude && (!f.visible || f.visible(values)));
  const main = visible.filter((f) => !f.advanced);
  const more = visible.filter((f) => f.advanced);
  const set = (key: string, v: string) => onChange({ ...values, [key]: v });
  const render = (f: (typeof visible)[number], i: number) => (
    <div key={f.key} className={`form-row form-row-${f.type}`}>
      {f.type !== 'boolean' && <label className="form-label">{f.label}</label>}
      <Field field={f} value={values[f.key] ?? ''} values={values} onChange={(v) => set(f.key, v)} autoFocus={i === 0 && !compact} />
      {f.help && f.type !== 'boolean' && <div className="form-help">{f.help}</div>}
    </div>
  );
  return (
    <div className={`widget-form${compact ? ' is-compact' : ''}`}>
      {main.map(render)}
      {more.length > 0 && (
        <>
          <button type="button" className={`disclosure${showMore ? ' is-open' : ''}`} onClick={() => setShowMore(!showMore)}>
            <IconChevron /> More options
          </button>
          {showMore && more.map((f, i) => render(f, i + main.length))}
        </>
      )}
    </div>
  );
}

export function WidgetPreview({ name, values, ctx }: { name: string; values: WidgetValues; ctx: WidgetContext }) {
  const ref = useRef<HTMLDivElement>(null);
  const def = getWidget(name);
  useEffect(() => {
    if (!ref.current) return;
    const inst = renderWidget(ref.current, name, values, ctx);
    return () => {
      inst?.destroy?.();
    };
  }, [name, values, ctx]);
  return (
    <div className={`widget-preview mn-doc${def?.kind === 'inline' ? ' is-inline' : ''}`}>
      {def?.kind === 'inline' ? (
        <p>
          <span className="widget-preview-context">…sounds like </span>
          <span ref={ref} className="mn-widget mn-widget-inline" />
          <span className="widget-preview-context"> in context.</span>
        </p>
      ) : (
        <div ref={ref} className="mn-widget mn-widget-block" />
      )}
    </div>
  );
}

interface ModalProps {
  name: string;
  initial: WidgetValues;
  mode: 'insert' | 'edit';
  ctx: WidgetContext;
  onSubmit(values: WidgetValues): void;
  onCancel(): void;
  onDelete?(): void;
}

/** Modal used to create widgets, and to edit block widgets. */
export function WidgetModal({ name, initial, mode, ctx, onSubmit, onCancel, onDelete }: ModalProps) {
  const def = getWidget(name)!;
  const played = instrumentField(def);
  const [values, setValues] = useState<WidgetValues>(initial);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onSubmit(values);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [values, onCancel, onSubmit]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className={`modal${played ? ' has-instrument' : ''}`} role="dialog" aria-modal="true" aria-label={def.title}>
        <header className="modal-header">
          <WidgetIcon svg={def.icon} className="modal-icon" />
          <div>
            <div className="modal-title">{def.title}</div>
            <div className="modal-subtitle">{def.description}</div>
          </div>
          <button className="icon-button modal-close" onClick={onCancel} aria-label="Close">
            <IconClose />
          </button>
        </header>
        <div className={`modal-body${def.fields.some((f) => f.type === 'roll') ? ' is-stacked' : ''}`}>
          <form
            className="modal-form"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(values);
            }}
          >
            <WidgetForm name={name} values={values} onChange={setValues} exclude={played?.key} />
            <button type="submit" hidden />
          </form>
          <div className="modal-preview">
            <div className="modal-preview-label">Preview</div>
            <WidgetPreview name={name} values={values} ctx={ctx} />
          </div>
        </div>
        {played && <InstrumentPanel field={played} values={values} onChange={setValues} />}
        <footer className="modal-footer">
          {mode === 'edit' && onDelete ? (
            <button className="button button-danger" onClick={onDelete}>
              Remove
            </button>
          ) : (
            <span className="modal-footer-hint">⌘↩ to {mode === 'insert' ? 'insert' : 'save'}</span>
          )}
          <div className="modal-footer-actions">
            <button className="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="button button-primary" onClick={() => onSubmit(values)}>
              {mode === 'insert' ? 'Insert' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

interface PopoverProps {
  name: string;
  values: WidgetValues;
  anchor: DOMRect;
  onChange(values: WidgetValues): void;
  onClose(): void;
  onDelete(): void;
}

/** Popover for editing inline widgets in place; changes apply live. */
export function WidgetPopover({ name, values, anchor, onChange, onClose, onDelete }: PopoverProps) {
  const def = getWidget(name);
  const played = instrumentField(def);
  const ref = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.left, top: anchor.bottom + 8 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = anchor.left + anchor.width / 2 - w / 2;
    left = Math.max(12, Math.min(window.innerWidth - w - 12, left));
    const bottom = window.innerHeight - (dockRef.current?.offsetHeight ?? 0) - 12;
    let top = anchor.bottom + 8;
    if (top + h > bottom) top = anchor.top - h - 8;
    // The anchor can scroll off-screen; keep the open form reachable.
    top = Math.max(12, Math.min(bottom - h, top));
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || dockRef.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown, true);
    };
  }, [onClose]);

  if (!def) return null;
  return (
    <>
    <div className="popover widget-popover" ref={ref} style={{ left: pos.left, top: pos.top }} role="dialog" aria-label={`Edit ${def.title}`}>
      <div className="popover-header">
        <WidgetIcon svg={def.icon} />
        <span>{def.title}</span>
      </div>
      <WidgetForm name={name} values={values} onChange={onChange} compact exclude={played?.key} />
      <div className="popover-footer">
        <button className="button button-small button-danger-quiet" onClick={onDelete}>
          Remove
        </button>
        <button className="button button-small button-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
    {played && (
      <div className="instrument-dock" ref={dockRef}>
        <InstrumentPanel field={played} values={values} onChange={onChange} />
      </div>
    )}
    </>
  );
}
