import * as Sentry from "@sentry/node";
import { LogImportance, LoggerMessageI, PipelineCtxI, ScopeLikeI } from "./types";
import { describeError } from "./describeError";
import { applyPipelineScope, applyReportScope } from "./sentryScopes";
import { writeToTerminal } from "./terminal";

/*
Vocabulario público (lo único que usa el código de aplicación):
  Logger.info(msg)              → breadcrumb + consola (contexto para developers)
  Logger.debug(msg)             → consola (info de desarrollo/testing)
  Logger.report(error, ctx)     → atrapaste un error y seguís: SIEMPRE issue
  Logger.reportPipeline(e, ctx) → fallo de envío de notificación: siempre issue
  Logger.scope(this | "nombre") → mismo vocabulario con scope derivado automático
  throw                         → lo captura el boundary HTTP (setupExpressErrorHandler)

CRITICAL/IMPORTANT son internos: los decide la política del consumidor (en el
boundary HTTP vía Logger.httpError), nunca el call site. Sentry es el único
destino remoto; el host decide cuándo está habilitado (instrument.ts).

Los estáticos privados log/capture/breadcrumb/terminalLogger son el contrato
de espionaje de setupLoggerMock (./testing): renombrarlos rompe las suites
de los consumidores.
*/

// Logger con ámbito (patrón logger-per-class): el nombre del use case sale
// solo de constructor.name — nadie tipea prefijos a mano. El título queda
// "<Scope>: <evento>" (evento corto y estable = fingerprinting limpio; el
// detalle variable va en description/extra) y `scope` viaja como tag.
export class ScopedLogger {
  constructor(private readonly name: string) {}

  info(event: string, ctx: Partial<LoggerMessageI> = {}): void {
    Logger.info(this.message(event, ctx));
  }

  debug(event: string, ctx: Partial<LoggerMessageI> = {}): void {
    Logger.debug(this.message(event, ctx));
  }

  report(error: unknown, ctx: Partial<LoggerMessageI> = {}): void {
    const event = ctx.title ?? describeError(error).text;
    Logger.report(error, this.message(event, ctx));
  }

  private message(event: string, ctx: Partial<LoggerMessageI>): LoggerMessageI {
    return { ...ctx, scope: this.name, title: `${this.name}: ${event}` };
  }
}

export class Logger {
  // ——— vocabulario público ———

  static scope(source: object | string): ScopedLogger {
    return new ScopedLogger(
      typeof source === "string" ? source : source?.constructor?.name || "UnknownScope"
    );
  }

  static info(message: LoggerMessageI): void {
    Logger.log(message, "INFO");
  }

  static debug(message: LoggerMessageI): void {
    Logger.log(message, "DEBUG");
  }

  // Única puerta a Issues fuera de throw, para errores atrapados sin rethrow
  // (background, webhooks, compensaciones): la captura automática nunca los ve.
  // Captura SIEMPRE: "esperado" modela un usuario recibiendo un 4xx, y en
  // estos contextos no hay usuario — un error tragado sin issue es invisible.
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

  // LA captura del pipeline de notificaciones. Acá no aplica "esperado": un
  // paciente sin notificación nunca es comportamiento esperado. Lleva tags
  // indexables de canal que report() no modela.
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

  // ——— boundary HTTP ———

  // Solo para el errorHandler del host: el nivel sale de su política (ej.
  // ServerError.isSignal), nunca de un literal en el call site. No captura —
  // eso ya lo hizo setupExpressErrorHandler.
  static httpError(message: LoggerMessageI, isSignal: boolean): void {
    Logger.log(message, isSignal ? "CRITICAL" : "IMPORTANT");
  }

  // ——— internos (contrato de spies — ver doc de cabecera) ———

  // Único punto de la librería que llama Sentry.captureException fuera del
  // boundary HTTP.
  private static capture(error: unknown, applyScope: (scope: ScopeLikeI) => void): void {
    Sentry.withScope((scope) => {
      applyScope(scope);
      Sentry.captureException(error);
    });
  }

  // report()/reportPipeline() viven dentro de .catch: si la telemetría lanzara
  // (falla del SDK, scope corrupto), sería unhandled rejection y bajaría el
  // proceso. La telemetría nunca puede voltear al caller.
  private static safely(operation: string, original: unknown, fn: () => void): void {
    try {
      fn();
    } catch (telemetryError) {
      try {
        console.error(`[Logger.${operation}] telemetry failure`, telemetryError, original);
      } catch {}
    }
  }

  // Escritor puro: consola + Sentry Logs (via consoleLoggingIntegration) +
  // breadcrumb para INFO. Nunca crea issues — eso es de report()/throw.
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
