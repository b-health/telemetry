import { LoggerMessageI, ReportDimsI } from "./types";
/**
 * Logger bound to a named scope (logger-per-class pattern).
 *
 * Created via {@link Logger.scope}. Every entry gets the title
 * `"<Scope>: <event>"` and the indexable `scope` Sentry tag — nobody types
 * prefixes by hand. Keep `event` short and stable (clean fingerprinting);
 * variable data belongs in `description`/`extra`.
 */
export declare class ScopedLogger {
    private readonly name;
    constructor(name: string);
    /**
     * Records developer context: a Sentry breadcrumb plus a console line.
     * Breadcrumbs attach automatically to any issue captured later in the same
     * execution context — the timeline finds you, you don't search for it.
     *
     * @param event - Short, stable event name (e.g. `"dedup_skipped"`).
     * @param ctx - Optional details (`description`, `hospitalId`, `extra`...).
     *
     * @example
     * this.log.info("dedup_skipped", { description: event.messageId });
     */
    info(event: string, ctx?: Partial<LoggerMessageI>): void;
    /**
     * Console-only output for development. Never reaches Sentry (no breadcrumb,
     * no Logs) — safe to leave in code, invisible in production monitoring.
     *
     * @param event - Short event name.
     * @param ctx - Optional details.
     */
    debug(event: string, ctx?: Partial<LoggerMessageI>): void;
    /**
     * Reports a swallowed error as a Sentry issue, prefixed with this scope.
     * Same contract as {@link Logger.report}: ALWAYS captures, never throws.
     *
     * @param error - The caught value (Error, string, anything).
     * @param ctx - Optional context. `ctx.title` overrides the event name
     *   derived from the error message.
     *
     * @example
     * } catch (err) {
     *   this.log.report(err, { hospitalId, extra: `agentId: ${id}` });
     * }
     */
    report(error: unknown, ctx?: Partial<LoggerMessageI>): void;
    private message;
}
export declare class Logger {
    /**
     * Creates a {@link ScopedLogger} with an auto-derived name.
     *
     * Pass `this` from a class (the name comes from `constructor.name` — never
     * typed by hand, impossible to misspell) or a string for module-level use.
     * The scope prefixes every title and becomes the indexable `scope` tag.
     *
     * @param source - A class instance (`this`) or an explicit scope name.
     * @returns A logger that stamps this scope on every entry.
     *
     * @example
     * class HandleInboundMessageUC {
     *   private readonly log = Logger.scope(this); // → "HandleInboundMessageUC"
     * }
     *
     * @example
     * const log = Logger.scope("hisSync.macena"); // module without a class
     */
    static scope(source: object | string): ScopedLogger;
    /**
     * Records developer context: a Sentry breadcrumb plus a console line.
     *
     * Use for business decisions worth seeing in an issue's timeline
     * ("reminder skipped because the appointment passed"). Costs nothing when
     * nothing fails: the breadcrumb buffer dies with the request.
     *
     * @param message - Structured entry. Keep `title` short and stable.
     *
     * @example
     * Logger.info({ title: "[sendOnDemand] Sending WhatsApp", description: `sendTo=${sendTo}` });
     */
    static info(message: LoggerMessageI): void;
    /**
     * Console-only output for development. Never reaches Sentry.
     *
     * @param message - Structured entry.
     */
    static debug(message: LoggerMessageI): void;
    /**
     * THE single gate to Sentry issues outside `throw` — for errors caught
     * WITHOUT rethrow (background tasks, webhook handlers, compensations),
     * which automatic capture never sees.
     *
     * ALWAYS captures: "expected error" models a user receiving a 4xx, and in
     * these contexts there is no user — a swallowed error without an issue is
     * invisible. Never throws (self-protected): safe inside any `.catch`.
     *
     * Rule of thumb: if you `throw`, do NOT call this (the HTTP boundary
     * captures); if you swallow, ALWAYS call this.
     *
     * @param error - The caught value. Captured as-is so Sentry keeps the
     *   original stack. When no Error is at hand, synthesize one with a STABLE
     *   message: `Logger.report(new Error("no_hospital_mapping"), { description })`.
     * @param ctx - Optional context. `hospitalId` becomes the `hospital.id`
     *   tag; `title` overrides the error message as issue title.
     *
     * @example
     * } catch (error) {
     *   Logger.report(error, { title: "[submitTemplate] rollback failed", hospitalId });
     *   return null; // flow continues — but the failure now exists in Sentry
     * }
     */
    static report(error: unknown, ctx?: Partial<LoggerMessageI>): void;
    /**
     * {@link Logger.report} plus consumer-defined searchable dimensions.
     *
     * This is the extension point for domain failure families: services define
     * a TYPED facade with their required dimensions and translate it into
     * generic `dims`. The library guarantees the mechanism (always captures,
     * never throws, base tags applied); the facade guarantees the vocabulary.
     *
     * @param error - The caught value.
     * @param dims - Searchable tags / readable contexts / Sentry user.
     * @param ctx - Optional base context (same contract as `report`).
     *
     * @example
     * // a consumer facade (e.g. OCA's notification pipeline):
     * export const reportPipeline = (error: unknown, ctx: PipelineCtxI): void =>
     *   Logger.reportTagged(error, {
     *     tags: { module: ctx.module, channel: ctx.channel },
     *     contexts: { notification: { id: ctx.notificationId } },
     *     user: ctx.hospitalId ? { id: ctx.hospitalId } : undefined,
     *   }, { hospitalId: ctx.hospitalId, title: `[${ctx.module}] ${ctx.channel} channel error` });
     */
    static reportTagged(error: unknown, dims: ReportDimsI, ctx?: Partial<LoggerMessageI>): void;
    /**
     * For the host's Express error handler ONLY — not application code.
     *
     * Writes the log line for an HTTP error at the level decided by the host's
     * policy (e.g. `ServerError.isSignal`). Does NOT capture: the host's
     * `setupExpressErrorHandler` already did.
     *
     * @param message - Structured entry built by the error handler.
     * @param isSignal - The host policy's verdict: `true` → CRITICAL,
     *   `false` (expected business error) → IMPORTANT.
     *
     * @example
     * // inside the host errorHandler middleware:
     * Logger.httpError(loggerMessage, ServerError.isSignal(error));
     */
    static httpError(message: LoggerMessageI, isSignal: boolean): void;
    /** Single point in the library that calls `Sentry.captureException` outside the HTTP boundary. */
    private static capture;
    /**
     * Telemetry must never take the caller down: report()/reportTagged() live
     * inside `.catch` handlers, where a secondary throw (SDK failure, corrupt
     * scope) would become an unhandled rejection and kill the process.
     */
    private static safely;
    /**
     * Pure writer: console + Sentry Logs (via consoleLoggingIntegration) +
     * breadcrumb for INFO. Never creates issues — that is report()/throw.
     */
    private static log;
    private static breadcrumb;
    private static terminalLogger;
}
