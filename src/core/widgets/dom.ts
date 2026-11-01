import type { WidgetContext } from './types';

type Attrs = Record<string, string | number | boolean | undefined | null | EventListener>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

function applyAttrs(el: Element, attrs: Attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.setAttribute('class', String(v));
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
}

function appendChildren(el: Element, children: (Child | Child[])[]) {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export const ICONS = {
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor"/></svg>',
  loop: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7V6a2 2 0 0 1 2-2h7m-2-2 2 2-2 2M13 9v1a2 2 0 0 1-2 2H4m2 2-2-2 2-2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function iconEl(svg: string, cls = 'mn-icon'): HTMLElement {
  const span = h('span', { class: cls });
  span.innerHTML = svg;
  return span;
}

/** A round play/stop toggle. */
export function playButton(onPlay: () => void, onStop: () => void, label = 'Play') {
  const btn = h('button', { class: 'mn-play', type: 'button', 'aria-label': label, title: label, 'data-interactive': true });
  btn.innerHTML = ICONS.play;
  let playing = false;
  const set = (p: boolean) => {
    playing = p;
    btn.innerHTML = p ? ICONS.stop : ICONS.play;
    btn.classList.toggle('is-playing', p);
    btn.setAttribute('aria-label', p ? 'Stop' : label);
  };
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (playing) {
      onStop();
      set(false);
    } else {
      set(true);
      onPlay();
    }
  });
  return { el: btn, set };
}

/** Standard card frame for block widgets. */
export function card(opts: { kind: string; title: Node | string; subtitle?: string; caption?: string }) {
  const actions = h('div', { class: 'mn-card-actions' });
  const body = h('div', { class: 'mn-card-body' });
  const el = h(
    'figure',
    { class: `mn-card mn-${opts.kind}` },
    h(
      'header',
      { class: 'mn-card-header' },
      h('div', { class: 'mn-card-titles' }, h('div', { class: 'mn-card-title' }, opts.title), opts.subtitle ? h('div', { class: 'mn-card-subtitle' }, opts.subtitle) : null),
      actions,
    ),
    body,
    opts.caption ? h('figcaption', { class: 'mn-card-caption' }, opts.caption) : null,
  );
  return { el, body, actions };
}

export function errorBox(message: string): HTMLElement {
  return h('div', { class: 'mn-error' }, message);
}

/** Pick the instrument for a widget: per-widget override or the document default. */
export function soundFor(values: Record<string, string>, ctx: WidgetContext): string {
  return values.sound || ctx.settings().sound;
}

/** Make an element behave like a button for mouse + keyboard. */
export function clickable(el: Element, fn: (e: Event) => void) {
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('data-interactive', '');
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  });
  el.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      e.stopPropagation();
      fn(e);
    }
  });
}

/** Briefly flash a class on an element. */
export function flash(el: Element, ms = 450, cls = 'is-active') {
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
