/**
 * The site's own mark — a round body, a fuse, a spark. Same 24x24 grid and
 * geometry as scripts/pwa-icons (favicon/apple-icon/manifest) and
 * app/opengraph-image.tsx draw it at, so the header, the browser tab and a
 * shared link all show the same shape.
 */
export function BombMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={className}>
      <circle cx="10" cy="15" r="7.2" fill="currentColor" />
      <path d="M14.6 9.4 L18.2 5.8" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      <circle cx="19.2" cy="4.8" r="1.7" fill="currentColor" />
    </svg>
  );
}
