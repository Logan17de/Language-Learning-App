import { AIKO_CANONICAL_ORIGIN } from "@/lib/app-url";

const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001f\u007f]/;

/**
 * Normalize a user-controlled redirect target to an AIko-internal path.
 *
 * The origin check is intentionally performed against AIko's canonical origin,
 * rather than the current browser origin, so the same validator is safe in
 * client code, middleware, OAuth callbacks, previews, and tests.
 */
export function safeInternalRedirect(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || CONTROL_OR_BACKSLASH.test(value)) {
    return null;
  }

  try {
    const url = new URL(value, AIKO_CANONICAL_ORIGIN);
    const canonical = new URL(AIKO_CANONICAL_ORIGIN);

    if (url.origin !== canonical.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function withSafeNext(pathname: string, next: string | null | undefined): string {
  const safeNext = safeInternalRedirect(next);
  if (!safeNext) return pathname;

  const target = new URL(pathname, AIKO_CANONICAL_ORIGIN);
  target.searchParams.set("next", safeNext);
  return `${target.pathname}${target.search}${target.hash}`;
}
