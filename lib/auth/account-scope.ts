const ACCOUNT_SCOPE_KEY = "aiko-account-scope-user-id";

/**
 * Local learner state must never cross Supabase account boundaries.
 * A missing owner is treated as legacy/untrusted state and cleared once before
 * the first authenticated identity is hydrated after this protection ships.
 */
export function prepareAccountScope(
  userId: string,
  resetAccountState: () => void,
): void {
  if (typeof window === "undefined" || !userId) return;

  let previousOwner: string | null = null;
  try {
    previousOwner = window.localStorage.getItem(ACCOUNT_SCOPE_KEY);
  } catch {
    // If storage cannot be inspected, clearing is safer than reusing state that
    // may belong to a different account.
  }

  if (previousOwner !== userId) {
    resetAccountState();
  }

  try {
    window.localStorage.setItem(ACCOUNT_SCOPE_KEY, userId);
  } catch {
    // The in-memory reset above still prevents cross-account reuse this session.
  }
}
