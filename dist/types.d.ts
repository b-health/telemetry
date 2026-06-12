/** Severity levels. Internal to the library: call sites never pick CRITICAL/IMPORTANT directly — the policy does. */
export type LogImportance = "CRITICAL" | "IMPORTANT" | "INFO" | "DEBUG";
/**
 * Structured payload for every log entry.
 *
 * Searchable dimensions (`hospitalId`, `scope`) become Sentry tags on capture;
 * everything else travels as extras/console output.
 *
 * `hospitalId` is deliberately first-class: hospital multi-tenancy is
 * platform-wide ubiquitous language at B.Health (every service has it),
 * unlike service-level vocabulary which belongs in consumer facades.
 */
export interface LoggerMessageI {
    /** Tenant identifier. Becomes the indexable `hospital.id` Sentry tag — include it whenever available. */
    hospitalId?: string;
    /** Acting user, for traceability. Travels as a Sentry extra. */
    userId?: string;
    /**
     * Event name. Keep it SHORT and STABLE (e.g. `"no_hospital_mapping"`):
     * Sentry groups issues by it. Variable data (ids, accounts) belongs in
     * `description`/`extra`, never here.
     */
    title: string;
    /** Human-readable detail. Free-form; variable data goes here. */
    description?: string;
    /** Stack trace. Auto-filled by `Logger.report()` from the error when omitted. */
    stack?: string;
    /** Arbitrary structured detail. Serialized defensively with `safeStringify` (circular-safe). */
    extra?: unknown;
    /** Origin class/module, set automatically by `Logger.scope()`. Becomes the indexable `scope` Sentry tag. */
    scope?: string;
}
/**
 * Custom searchable dimensions for {@link Logger.reportTagged}.
 *
 * This is the polymorphic mechanism behind consumer facades: each service
 * defines its own typed facade (e.g. OCA's `reportPipeline` with required
 * `module`/`channel`) and translates it into these generic dimensions. The
 * library ships the mechanism; the consumer owns the vocabulary.
 */
export interface ReportDimsI {
    /** Indexable Sentry tags. `undefined` values are skipped. */
    tags?: Record<string, string | undefined>;
    /** Readable Sentry contexts (shown on the issue, not searchable). `undefined` values are skipped. */
    contexts?: Record<string, Record<string, any> | undefined>;
    /** Sentry user for per-actor grouping (e.g. the tenant). */
    user?: {
        id: string;
    };
}
/**
 * Minimal structural view of a Sentry scope.
 *
 * Lets the `apply*Scope` helpers be tested with a plain fake — no SDK
 * mocking required.
 */
export interface ScopeLikeI {
    setTag(key: string, value: string): unknown;
    setContext(key: string, value: Record<string, any>): unknown;
    setUser(user: {
        id: string;
    }): unknown;
    setExtra(key: string, value: unknown): unknown;
}
