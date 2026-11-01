import type { SVGProps } from 'react';

const base = { width: 18, height: 18, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconSidebar = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
    <path d="M7.5 3.5v13" />
  </svg>
);
export const IconCompose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M9 3.5H5a2 2 0 0 0-2 2V15a2 2 0 0 0 2 2h9.5a2 2 0 0 0 2-2v-4" />
    <path d="M14.6 2.6a1.6 1.6 0 0 1 2.3 2.3L10.5 11.3 7.5 12l.7-3z" />
  </svg>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);
export const IconSliders = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 6h7M15 6h1M4 14h1M9 14h7" />
    <circle cx="13" cy="6" r="2" />
    <circle cx="7" cy="14" r="2" />
  </svg>
);
export const IconShare = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M10 12.5V3M6.5 6.5 10 3l3.5 3.5" />
    <path d="M6 9.5H5a1.5 1.5 0 0 0-1.5 1.5v4.5A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5V11A1.5 1.5 0 0 0 15 9.5h-1" />
  </svg>
);
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="m13.2 13.2 3.3 3.3" />
  </svg>
);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 6h12M8 6V4.5h4V6M5.5 6l.7 10a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9l.7-10" />
  </svg>
);
export const IconPencil = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M13.6 3.6a1.8 1.8 0 0 1 2.6 2.6L7 15.4l-3.4.9.9-3.4z" />
  </svg>
);
export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <svg width={14} height={14} viewBox="0 0 16 16" {...p}>
    <path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z" fill="currentColor" />
  </svg>
);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
  </svg>
);
export const IconLink = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.8.8" />
    <path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.8-.8" />
  </svg>
);
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} width={12} height={12} {...p}>
    <path d="m7 5 5 5-5 5" />
  </svg>
);

/** Render a widget's SVG icon string. */
export function WidgetIcon({ svg, className }: { svg: string; className?: string }) {
  return <span className={className ?? 'widget-icon'} dangerouslySetInnerHTML={{ __html: svg }} />;
}
