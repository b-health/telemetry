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
export declare const describeError: (error: unknown) => DescribedErrorI;
/**
 * Extracts the diagnostic payload an error carries beyond message/name/stack.
 *
 * Wrapped errors are the norm at B.Health (`ServerError` with a fixed message
 * per call site): the real cause travels INSIDE the object — `extraInfo`
 * (provider response, Prisma code) and the standard `cause`. Serializing an
 * Error by message/stack alone drops exactly that, which makes every DB
 * failure indistinguishable in terminal/CloudWatch logs (Sentry gets the
 * object; the log line did not).
 *
 * `extraInfo` wins over `cause` when both exist: wrappers that set `extraInfo`
 * already embed a described cause in it — printing both would duplicate.
 *
 * Total function like {@link describeError}: NEVER throws.
 *
 * @param error - Any caught value.
 * @returns A small structured object for the log line's `extra`, or
 *   `undefined` when the error carries no diagnostics.
 */
export declare const errorDiagnostics: (error: unknown) => Record<string, unknown> | undefined;
