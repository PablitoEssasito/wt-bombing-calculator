/**
 * The site's own mark — an aerial bomb, not the cartoon fused kind: a domed
 * nose, a straight body, a tapered tail and a pair of fins. Same 24x24 grid
 * and geometry as scripts/pwa-icons (favicon/apple-icon/manifest) and
 * app/opengraph-image.tsx draw it at, so the header, the browser tab and a
 * shared link all show the same shape.
 */
export function BombMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={className}>
      <rect x="10.5" y="1" width="3" height="7" rx="1.5" fill="currentColor" />
      <polygon points="8,8 2,12 8,13" fill="currentColor" />
      <polygon points="16,8 22,12 16,13" fill="currentColor" />
      <circle cx="12" cy="8" r="4" fill="currentColor" />
      <polygon points="8,8 16,8 13.5,19 12,21 10.5,19" fill="currentColor" />
    </svg>
  );
}
