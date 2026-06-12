export interface DescribedErrorI {
  base?: Error;
  text: string;
}

// Total: nunca lanza, ni con getters/toString envenenados — sus callers viven
// dentro de .catch handlers donde una excepción sería unhandled rejection.
export const describeError = (error: unknown): DescribedErrorI => {
  try {
    const base = error instanceof Error ? error : undefined;
    return { base, text: base?.message ?? String(error) };
  } catch {
    return { text: "[undescribable error]" };
  }
};
