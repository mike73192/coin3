const ABSOLUTE_PROTOCOL_PATTERN = /^(?:[a-z][a-z\d+\-.]*:)?\/\//i;
const DATA_URL_PATTERN = /^data:/i;

const ensureTrailingSlash = (value: string): string =>
  value.endsWith('/') ? value : `${value}/`;

/**
 * Resolves a URL for assets that live under the public directory so they respect Vite's base path.
 */
export const resolvePublicAssetUrl = (path: string): string => {
  if (!path || ABSOLUTE_PROTOCOL_PATTERN.test(path) || DATA_URL_PATTERN.test(path)) {
    return path;
  }

  const sanitized = path.startsWith('/') ? path.slice(1) : path;
  const base = import.meta.env.BASE_URL || '/';

  if (typeof window === 'undefined') {
    return `${ensureTrailingSlash(base)}${sanitized}`;
  }

  const resolvedBase = new URL(base, window.location.href);
  return new URL(sanitized, ensureTrailingSlash(resolvedBase.toString())).toString();
};
