// A small hand-rolled icon set (24x24 viewBox, 1.75 stroke) — deliberately
// not a dependency, kept to the handful of glyphs this UI actually needs.
export type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconCheck({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconLoader({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function IconRetry({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M3 12a9 9 0 0 1 15.3-6.5M21 12a9 9 0 0 1-15.3 6.5" />
      <path d="M18 3v4h-4M6 21v-4h4" />
    </svg>
  );
}

export function IconAlert({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z" />
    </svg>
  );
}

export function IconLock({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconRefresh({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M3 12a9 9 0 0 1 15.3-6.5L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.5L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function IconExternal({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function IconLayers({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  );
}

export function IconGauge({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M4.5 18a7.5 7.5 0 1 1 15 0" />
      <path d="M12 13.5 15 9" />
      <path d="M12 18h.01" />
    </svg>
  );
}

export function IconFileText({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5M9 13h6M9 16.5h6M9 9.5h2" />
    </svg>
  );
}

export function IconArchive({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 13h4" />
    </svg>
  );
}

export function IconPlay({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M6 4.5v15l14-7.5-14-7.5Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconHistory({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}
