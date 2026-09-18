/**
 * Mirrors next.config.ts's own `basePath`. GitHub Pages serves a project
 * without a custom domain under /<repo> rather than the domain root, and
 * unlike next/link and next/router, a plain `<Image src>` isn't rewritten for
 * that automatically — the basePath docs call this out by name. Empty outside
 * CI, where next.config.ts leaves basePath unset and the app sits at the root.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefixes a root-relative public/ asset path with the deploy's base path. */
export const withBasePath = (path: string) => `${BASE_PATH}${path}`;
