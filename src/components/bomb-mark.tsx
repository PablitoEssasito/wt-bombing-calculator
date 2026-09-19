/**
 * The site's own mark — a bomb falling on the diagonal, tail fins and all.
 * One connected mass rather than thin spikes radiating from a centre: a
 * symmetric four-point version (nose, two fins, a stem) read as a star or a
 * compass rose once shrunk to a browser tab's actual size, not a bomb. Same
 * 24x24 grid and geometry as scripts/pwa-icons (favicon/apple-icon/manifest)
 * and app/opengraph-image.tsx draw it at, so the header, the browser tab and
 * a shared link all show the same shape.
 */
export function BombMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={className}>
      <g transform="rotate(-35 12 12)">
        <polygon points="7,8 9,2 15,2 17,8" fill="currentColor" />
        <ellipse cx="12" cy="14" rx="5.5" ry="8" fill="currentColor" />
      </g>
    </svg>
  );
}
