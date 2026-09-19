/**
 * The site's own mark — an aerial bomb on the diagonal, drawn as separate
 * plates (two finned tail plates, a collar, the body, a band and the nose
 * cap) with the background showing through between them, the way the
 * reference art uses dark lines to separate its panels.
 *
 * Same 64x64 grid and geometry as scripts/pwa-icons (favicon/apple-icon/
 * manifest) and app/opengraph-image.tsx draw it at, so the header, the
 * browser tab and a shared link all show the same shape. The three copies
 * exist because each renders in a different place — real DOM, sharp, and
 * Satori — not because they are meant to drift.
 */
export function BombMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className={className}>
      <g transform="rotate(-40 32 32)">
        <g transform="translate(32 32) scale(0.86) translate(-32 -32)" fill="currentColor">
          <polygon points="27,10.5 11.5,4.5 11,10 26.5,16" />
          <polygon points="26.4,17.8 10.9,11.8 10.3,17.3 25.8,23.3" />
          <polygon points="37,10.5 52.5,4.5 53,10 37.5,16" />
          <polygon points="37.6,17.8 53.1,11.8 53.7,17.3 38.2,23.3" />
          <polygon points="28.6,14 29.2,8.5 34.8,8.5 35.4,14" />
          <polygon points="26.4,13.4 24.4,18.6 39.6,18.6 37.6,13.4" />
          <polygon points="24.1,20.8 23.2,22.5 21.8,26 20.7,30 19.9,34 19.3,38 19,42 19.15,45.6 44.85,45.6 45,42 44.7,38 44.1,34 43.3,30 42.2,26 40.8,22.5 39.9,20.8" />
          <polygon points="19.5,47.8 20.7,50.8 43.3,50.8 44.5,47.8" />
          <polygon points="21,53 22.4,55 24.2,57 26.5,58.5 29.2,59.6 32,60 34.8,59.6 37.5,58.5 39.8,57 41.6,55 43,53" />
        </g>
      </g>
    </svg>
  );
}
