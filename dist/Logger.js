"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.ScopedLogger = void 0;
const Sentry = __importStar(require("@sentry/node"));
const describeError_1 = require("./describeError");
const sentryScopes_1 = require("./sentryScopes");
const terminal_1 = require("./terminal");
/*
Public vocabulary (the ONLY thing application code uses):
  Logger.info(msg)                    → breadcrumb + console (developer context)
  Logger.debug(msg)                   → console (development/testing noise)
  Logger.report(error, ctx)           → caught an error and moving on: ALWAYS an issue
  Logger.reportTagged(e, dims, ctx)   → same, with consumer-defined searchable dimensions
  Logger.scope(this | "name")         → same vocabulary with an auto-derived scope
  throw                               → captured by the host's HTTP boundary

Domain-specific failure families (e.g. OCA's notification pipeline) are NOT
library API: each consumer defines a typed facade over reportTagged with its
own required dimensions. The library ships mechanism, consumers own vocabulary.

CRITICAL/IMPORTANT are internal: the policy decides them (in the HTTP boundary
via Logger.httpError), never the call site. Sentry is the only remote
destination; the host owns the SDK init and decides when it is enabled.

The private statics log/capture/breadcrumb/terminalLogger are the spying
contract of setupLoggerMock (./testing): renaming them breaks consumer suites.
*/
/**
 * Logger bound to a named scope (logger-per-class pattern).
 *
 * Created via {@link Logger.scope}. Every entry gets the title
 * `"<Scope>: <event>"` and the indexable `scope` Sentry tag — nobody types
 * prefixes by hand. Keep `event` short and stable (clean fingerprinting);
 * variable data belongs in `description`/`extra`.
 */
class ScopedLogger {
    constructor(name) {
        this.name = name;
    }
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
    info(event, ctx = {}) {
        Logger.info(this.message(event, ctx));
    }
    /**
     * Console-only output for development. Never reaches Sentry (no breadcrumb,
     * no Logs) — safe to leave in code, invisible in production monitoring.
     *
     * @param event - Short event name.
     * @param ctx - Optional details.
     */
    debug(event, ctx = {}) {
        Logger.debug(this.message(event, ctx));
    }
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
    report(error, ctx = {}) {
        const event = ctx.title ?? (0, describeError_1.describeError)(error).text;
        Logger.report(error, this.message(event, ctx));
    }
    message(event, ctx) {
        return { ...ctx, scope: this.name, title: `${this.name}: ${event}` };
    }
}
exports.ScopedLogger = ScopedLogger;
class Logger {
    // ——— public vocabulary ———
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
    static scope(source) {
        return new ScopedLogger(typeof source === "string" ? source : source?.constructor?.name || "UnknownScope");
    }
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
    static info(message) {
        Logger.log(message, "INFO");
    }
    /**
     * Console-only output for development. Never reaches Sentry.
     *
     * @param message - Structured entry.
     */
    static debug(message) {
        Logger.log(message, "DEBUG");
    }
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
    static report(error, ctx = {}) {
        Logger.reportTagged(error, {}, ctx);
    }
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
    static reportTagged(error, dims, ctx = {}) {
        Logger.safely("reportTagged", error, () => {
            const { base, text } = (0, describeError_1.describeError)(error);
            const message = {
                ...ctx,
                title: ctx.title ?? text,
                stack: ctx.stack ?? base?.stack,
            };
            Logger.capture(error, (scope) => {
                (0, sentryScopes_1.applyReportScope)(scope, message);
                (0, sentryScopes_1.applyDims)(scope, dims);
            });
            Logger.log(message, "CRITICAL");
        });
    }
    // ——— HTTP boundary ———
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
    static httpError(message, isSignal) {
        Logger.log(message, isSignal ? "CRITICAL" : "IMPORTANT");
    }
    // ——— internals (spy contract — see header doc) ———
    /** Single point in the library that calls `Sentry.captureException` outside the HTTP boundary. */
    static capture(error, applyScope) {
        Sentry.withScope((scope) => {
            applyScope(scope);
            Sentry.captureException(error);
        });
    }
    /**
     * Telemetry must never take the caller down: report()/reportTagged() live
     * inside `.catch` handlers, where a secondary throw (SDK failure, corrupt
     * scope) would become an unhandled rejection and kill the process.
     */
    static safely(operation, original, fn) {
        try {
            fn();
        }
        catch (telemetryError) {
            try {
                console.error(`[Logger.${operation}] telemetry failure`, telemetryError, original);
            }
            catch { }
        }
    }
    /**
     * Pure writer: console + Sentry Logs (via consoleLoggingIntegration) +
     * breadcrumb for INFO. Never creates issues — that is report()/throw.
     */
    static log(message, importance = "DEBUG") {
        if (importance === "INFO")
            Logger.breadcrumb(message);
        Logger.terminalLogger(importance, message);
    }
    static breadcrumb(message) {
        Sentry.addBreadcrumb({
            category: message.scope ?? message.title,
            type: "info",
            level: "info",
            message: message.description ?? message.title,
            data: {
                ...(message.hospitalId ? { hospitalId: message.hospitalId } : {}),
                ...(message.userId ? { userId: message.userId } : {}),
                ...(message.extra ? { extra: message.extra } : {}),
            },
        });
    }
    static terminalLogger(importance, message) {
        (0, terminal_1.writeToTerminal)(importance, message);
    }
}
exports.Logger = Logger;
