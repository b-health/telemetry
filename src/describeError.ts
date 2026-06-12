export interface DescribedErrorI {
  /** The original value when it was an `Error` instance. */
  base?: Error;
  /** Best-effort human-readable text for the value. */
  text: string;
}

/**
 * Derives a printable description from any thrown value.
 *
 * Total function: NEVER throws, even on poisoned `message` getters or
 * `toString` implementations — its callers live inside `.catch` handlers
 * where a secondary exception would become an unhandled rejection.
 *
 * @param error - Any caught value (`Error`, string, object, undefined...).
 * @returns The original `Error` (when applicable) and a safe text for it.
 */
export const describeError = (error: unknown): DescribedErrorI => {
  try {
    const base = error instanceof Error ? error : undefined;
    return { base, text: base?.message ?? String(error) };
  } catch {
    return { text: "[undescribable error]" };
  }
};
