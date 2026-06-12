import * as Sentry from "@sentry/node";
import { safeStringify } from "./safeStringify";

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
*/

export type LogImportance = "CRITICAL" | "IMPORTANT" | "INFO" | "DEBUG";

export interface LoggerMessageI {
  hospitalId?: string;
  userId?: string;
  title: string;
  description?: string;
  stack?: string;
  extra?: unknown;
  // ámbito derivado (clase/módulo de origen): viaja como tag indexable `scope`
  scope?: string;
}

export interface PipelineCtxI {
  // vocabulario del consumidor (ej. en OCA: "appointment" | "prescription" | ...)
  module: string;
  channel: string;
  type?: string;
  hospitalId?: string;
  notificationId?: string;
  sendTo?: string;
  patientName?: string;
  payload?: Record<string, any>;
}

const describeError = (error: unknown): { base?: Error; text: string } => {
  const base = error instanceof Error ? error : undefined;
  return { base, text: base?.message ?? String(error) };
};

export interface ScopeLikeI {
  setTag(key: string, value: string): unknown;
  setContext(key: string, value: Record<string, any>): unknown;
  setUser(user: { id: string }): unknown;
  setExtra(key: string, value: unknown): unknown;
}

// Los apply*Scope están separados de report/reportPipeline para poder testear
// los tags exactos (hospital.id, scope, module, channel) sin mockear el SDK:
// una regresión acá rompe dashboards/alerts sin que falle ningún otro test.
export const applyPipelineScope = (scope: ScopeLikeI, ctx: PipelineCtxI): void => {
  scope.setTag("module", ctx.module);
  scope.setTag("channel", ctx.channel);
  if (ctx.type) scope.setTag("notification_type", ctx.type);
  if (ctx.hospitalId) scope.setTag("hospital.id", ctx.hospitalId);

  scope.setContext("notification", {
    id: ctx.notificationId,
    hospitalId: ctx.hospitalId,
    type: ctx.type,
    channel: ctx.channel,
    sendTo: ctx.sendTo,
    patientName: ctx.patientName,
  });
  if (ctx.payload) scope.setContext("payload", ctx.payload);
  if (ctx.hospitalId) scope.setUser({ id: ctx.hospitalId });
};

export const applyReportScope = (scope: ScopeLikeI, message: LoggerMessageI): void => {
  if (message.hospitalId) scope.setTag("hospital.id", message.hospitalId);
  if (message.scope) scope.setTag("scope", message.scope);

  scope.setExtra("title", message.title);
  if (message.userId) scope.setExtra("userId", message.userId);
  if (message.description) scope.setExtra("description", message.description);
  if (message.extra) scope.setExtra("extra", safeStringify(message.extra));
};

// Logger con ámbito (patrón logger-per-class): el nombre del use case sale
// solo de constructor.name — nadie tipea prefijos a mano. El título queda
// "<Scope>: <evento>" (evento corto y estable = fingerprinting limpio; el
// detalle variable va en description/extra) y `scope` viaja como tag.
export class ScopedLogger {
  constructor(private readonly name: string) {}

  private message(event: string, ctx: Partial<LoggerMessageI>): LoggerMessageI {
    return { ...ctx, scope: this.name, title: `${this.name}: ${event}` };
  }

  info(event: string, ctx: Partial<LoggerMessageI> = {}): void {
    Logger.info(this.message(event, ctx));
  }

  debug(event: string, ctx: Partial<LoggerMessageI> = {}): void {
    Logger.debug(this.message(event, ctx));
  }

  report(error: unknown, ctx: Partial<LoggerMessageI> = {}): void {
    // describeError puede tirar con un valor envenenado (toString/getter):
    // el título se deriva bajo el mismo paraguas que protege al caller —
    // este método vive en .catch handlers igual que Logger.report.
    let event: string;
    try {
      event = ctx.title ?? describeError(error).text;
    } catch {
      event = "error";
    }
    Logger.report(error, this.message(event, ctx));
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

  // ——— interno / boundaries ———

  // Solo para el errorHandler HTTP: el nivel sale de la política del host
  // (ej. ServerError.isSignal), nunca de un literal en el call site. No
  // captura — eso ya lo hizo setupExpressErrorHandler.
  static httpError(message: LoggerMessageI, isSignal: boolean): void {
    Logger.log(message, isSignal ? "CRITICAL" : "IMPORTANT");
  }

  // Único punto de la librería que llama Sentry.captureException fuera del
  // boundary HTTP.
  private static capture(error: unknown, applyScope: (scope: ScopeLikeI) => void): void {
    Sentry.withScope((scope) => {
      applyScope(scope);
      Sentry.captureException(error);
    });
  }

  // report()/reportPipeline() viven dentro de .catch: si la telemetría lanzara
  // (toString envenenado, falla del SDK), sería unhandled rejection y bajaría
  // el proceso. La telemetría nunca puede voltear al caller.
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

  private static terminalLogger(importance: LogImportance, message: LoggerMessageI) {
    const colorCode = Logger.getColorCode(importance);
    const formatedMessage = Logger.formatMessage(message, importance);
    const resetColor = "\x1b[37m";
    switch (importance) {
      case "CRITICAL":
        console.error(`${colorCode}${formatedMessage}${resetColor}`);
        break;
      case "IMPORTANT":
        console.warn(`${colorCode}${formatedMessage}${resetColor}`);
        break;
      case "INFO":
        console.info(`${colorCode}${formatedMessage}${resetColor}`);
        break;
      case "DEBUG":
      default:
        console.log(`${colorCode}${formatedMessage}${resetColor}`);
        break;
    }
  }

  private static getColorCode = (importance: LogImportance = "DEBUG") => {
    if (importance === "DEBUG") {
      return "\x1b[33m"; // yellow for DEBUG
    } else if (importance === "IMPORTANT") {
      return "\x1b[38;5;208m"; // orange for IMPORTANT
    } else if (importance === "CRITICAL") {
      return "\x1b[31m\x1b[1m"; // red and bold for CRITICAL
    } else if (importance === "INFO") {
      return "\x1b[36m"; // cyan for INFO
    }
    return "\x1b[37m"; // default color is white
  };

  private static formatMessage = (message: LoggerMessageI, importance: LogImportance = "DEBUG") => {
    const headerParts: string[] = [`[${importance}] ${message.title || "No Title"}`];
    if (message.hospitalId) headerParts.push(`HospitalId: ${message.hospitalId}`);
    if (message.userId) headerParts.push(`UserId: ${message.userId}`);
    headerParts.push(`ENV: ${process.env.NODE_ENV}`);
    headerParts.push(new Date().toISOString());

    const lines: string[] = [headerParts.join(" | ")];
    if (message.description) lines.push(`  description: ${message.description}`);
    if (message.extra) lines.push(`  extra: ${safeStringify(message.extra)}`);
    if (message.stack) lines.push(`  stack: ${message.stack}`);
    return lines.join("\n");
  };
}
