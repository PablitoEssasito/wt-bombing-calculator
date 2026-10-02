/**
 * Side-on silhouettes for the armament page's sections, nose to the left: a
 * free-fall bomb (a rounded body tapering to its tail fins), a torpedo (a
 * long tube, fins and a propeller at the tail) and an air-to-ground missile
 * (a long tube, delta wings at mid-body, fins at the tail). Wider than tall,
 * as the weapons are; filled with the text colour.
 */

type IconProps = { className?: string };

export function BombSilhouette({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 12" width={24} height={9} aria-hidden className={className} fill="currentColor">
      <path d="M1 6C1 3.3 5.5 1.6 11.5 1.6L18.5 2.4C21.8 2.9 24 4.3 24.6 6C24 7.7 21.8 9.1 18.5 9.6L11.5 10.4C5.5 10.4 1 8.7 1 6Z" />
      <rect x="24" y="5.2" width="6" height="1.6" />
      <polygon points="24.6,4.6 27.6,0.6 31.2,0.6 29.4,4.9" />
      <polygon points="24.6,7.4 27.6,11.4 31.2,11.4 29.4,7.1" />
    </svg>
  );
}

export function TorpedoSilhouette({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 12" width={24} height={9} aria-hidden className={className} fill="currentColor">
      <path d="M3.5 4H25.5L28.6 5.2V6.8L25.5 8H3.5C2 8 0.8 7.1 0.8 6S2 4 3.5 4Z" />
      <polygon points="26,4.3 28.4,1.6 29.6,1.6 28.9,5.3" />
      <polygon points="26,7.7 28.4,10.4 29.6,10.4 28.9,6.7" />
      <rect x="29.8" y="3.4" width="1.3" height="5.2" />
    </svg>
  );
}

export function MissileSilhouette({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 12" width={24} height={9} aria-hidden className={className} fill="currentColor">
      <path d="M3.4 4H29V8H3.4C1.9 8 0.8 7.1 0.8 6S1.9 4 3.4 4Z" />
      <rect x="29" y="4.7" width="1.6" height="2.6" />
      <polygon points="12,4 20.5,4 20.5,0.8" />
      <polygon points="12,8 20.5,8 20.5,11.2" />
      <polygon points="25.6,4 29,4 29,1.4 27.2,1.4" />
      <polygon points="25.6,8 29,8 29,10.6 27.2,10.6" />
    </svg>
  );
}
