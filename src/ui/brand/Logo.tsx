/**
 * Uberewind mark: a rounded square holding a counter-clockwise ring arrow and
 * a "rewind" double chevron. Monochrome; `invert` swaps black and white.
 * (Original artwork, deliberately distinct from Uber's own logo.)
 */
export function Logo({ size = 32, invert = false, title }: { size?: number; invert?: boolean; title?: string }) {
  const bg = invert ? '#ffffff' : '#000000';
  const fg = invert ? '#000000' : '#ffffff';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className="logo"
    >
      <rect width="64" height="64" rx="15" fill={bg} />
      {/* ring arrow, running counter-clockwise, opening at the top */}
      <path d="M25.84 15.09 A18 18 0 1 0 38.16 15.09" fill="none" stroke={fg} strokeWidth="5" strokeLinecap="round" />
      <path d="M32.3 12.9 L41.4 9.9 L37.6 20.8 Z" fill={fg} stroke={fg} strokeWidth="1.5" strokeLinejoin="round" />
      {/* rewind ◀◀ */}
      <path
        d="M21.5 33.5 L30.5 27.6 L30.5 39.4 Z M31.5 33.5 L40.5 27.6 L40.5 39.4 Z"
        fill={fg}
        stroke={fg}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** "UBE" (sober sans) + "REWIND" (italic serif, accent gradient). */
export function Wordmark({ as: Tag = 'span', className = '' }: { as?: 'span' | 'h1'; className?: string }) {
  return (
    <Tag className={`wordmark ${className}`} aria-label="Uberewind">
      <span className="wm-ube" aria-hidden="true">
        UBE
      </span>
      <span className="wm-rewind" aria-hidden="true">
        REWIND
      </span>
    </Tag>
  );
}
