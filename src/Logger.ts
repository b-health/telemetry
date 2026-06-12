import * as Sentry from "@sentry/node";
import { LogImportance, LoggerMessageI, PipelineCtxI, ScopeLikeI } from "./types";
import { describeError } from "./describeError";
import { applyPipelineScope, applyReportScope } from "./sentryScopes";
import { writeToTerminal } from "./terminal";

/*
Public vocabulary (the ONLY thing application code uses):
  Logger.info(msg)              → breadcrumb + console (developer context)
  Logger.debug(msg)             → console (development/testing noise)
  Logger.report(error, ctx)     → caught an error and moving on: ALWAYS an issue
  Logger.reportPipeline(e, ctx) → notification delivery failure: issue + channel tags
  Logger.scope(this | "name")   → same vocabulary with an auto-derived scope
  throw                         → captured by the host's HTTP boundary

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
export class ScopedLogger {
  constructor(private readonly name: string) {}

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
  info(event: string, ctx: Partial<LoggerMessageI> = {}): void {
    Logger.info(this.message(event, ctx));
  }

  /**
   * Console-only output for development. Never reaches Sentry (no breadcrumb,
   * no Logs) — safe to leave in code, invisible in production monitoring.
   *
   * @param event - Short event name.
   * @param ctx - Optional details.
   */
  debug(event: string, ctx: Partial<LoggerMessageI> = {}): void {
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
  report(error: unknown, ctx: Partial<LoggerMessageI> = {}): void {
    const event = ctx.title ?? describeError(error).text;
    Logger.report(error, this.message(event, ctx));
  }

  private message(event: string, ctx: Partial<LoggerMessageI>): LoggerMessageI {
    return { ...ctx, scope: this.name, title: `${this.name}: ${event}` };
  }
}

export class Logger {
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
  static scope(source: object | string): ScopedLogger {
    return new ScopedLogger(
      typeof source === "string" ? source : source?.constructor?.name || "UnknownScope"
    );
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
  static info(message: LoggerMessageI): void {
    Logger.log(message, "INFO");
  }

  /**
   * Console-only output for development. Never reaches Sentry.
   *
   * @param message - Structured entry.
   */
  static debug(message: LoggerMessageI): void {
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
  static report(error: unknown, ctx: Partial<LoggerMessageI> = {}): void {
    Logger.safely("report", error, () => {
      const { base, text } = describeError(error);
      const message: LoggerMessageI = {
        ...ctx,
        title: ctx.title ?? text,
        stack: ctx.stack ?? base?.stack,
      };
      Logger.capture(error, (scope) => applyReportScope(scope, message));
      Logger.log(message, "CRITICAL");
    });
  }

  /**
   * THE capture for notification-delivery failures (WhatsApp/email/SMS).
   *
   * Differs from {@link Logger.report} in its context contract: the type
   * system REQUIRES `module` and `channel`, which become the Sentry tags
   * that dashboards and alert rules slice by ("are WhatsApp reminders
   * failing for hospital 5?"). A patient left unnotified is never expected
   * behavior — this always captures. Never throws.
   *
   * Do NOT add a `Logger.log`/`Logger.info` next to this call: it already
   * writes the terminal line.
   *
   * @param error - The caught value from the send attempt.
   * @param ctx - Channel dimensions (required) + notification pointers.
   *
   * @example
   * } catch (error) {
   *   Logger.reportPipeline(error, {
   *     module: "appointment",
   *     channel: "WHATSAPP",
   *     type: notification.type,
   *     hospitalId: notification.hospitalId,
   *     notificationId: notification.id,
   *   });
   *   notification.setStatusWithObservations("ERROR", error.message);
   * }
   */
  static reportPipeline(error: unknown, ctx: PipelineCtxI): void {
    Logger.safely("reportPipeline", error, () => {
      Logger.capture(error, (scope) => applyPipelineScope(scope, ctx));

      const { base, text } = describeError(error);
      Logger.log(
        {
          title: `[${ctx.module}] ${ctx.channel} channel error`,
          hospitalId: ctx.hospitalId,
          description: text,
          stack: base?.stack,
          extra: ctx.notificationId ? `notificationId: ${ctx.notificationId}` : undefined,
        },
        "CRITICAL"
      );
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
  static httpError(message: LoggerMessageI, isSignal: boolean): void {
    Logger.log(message, isSignal ? "CRITICAL" : "IMPORTANT");
  }

  // ——— internals (spy contract — see header doc) ———

  /** Single point in the library that calls `Sentry.captureException` outside the HTTP boundary. */
  private static capture(error: unknown, applyScope: (scope: ScopeLikeI) => void): void {
    Sentry.withScope((scope) => {
      applyScope(scope);
      Sentry.captureException(error);
    });
  }

  /**
   * Telemetry must never take the caller down: report()/reportPipeline() live
   * inside `.catch` handlers, where a secondary throw (SDK failure, corrupt
   * scope) would become an unhandled rejection and kill the process.
   */
  private static safely(operation: string, original: unknown, fn: () => void): void {
    try {
      fn();
    } catch (telemetryError) {
      try {
        console.error(`[Logger.${operation}] telemetry failure`, telemetryError, original);
      } catch {}
    }
  }

  /**
   * Pure writer: console + Sentry Logs (via consoleLoggingIntegration) +
   * breadcrumb for INFO. Never creates issues — that is report()/throw.
   */
  private static log(message: LoggerMessageI, importance: LogImportance = "DEBUG"): void {
    if (importance === "INFO") Logger.breadcrumb(message);
    Logger.terminalLogger(importance, message);
  }

  private static breadcrumb(message: LoggerMessageI): void {
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

  private static terminalLogger(importance: LogImportance, message: LoggerMessageI): void {
    writeToTerminal(importance, message);
  }
}
