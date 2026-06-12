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
class ScopedLogger {
    constructor(name) {
        this.name = name;
    }
    info(event, ctx = {}) {
        Logger.info(this.message(event, ctx));
    }
    debug(event, ctx = {}) {
        Logger.debug(this.message(event, ctx));
    }
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
    // ——— vocabulario público ———
    static scope(source) {
        return new ScopedLogger(typeof source === "string" ? source : source?.constructor?.name || "UnknownScope");
    }
    static info(message) {
        Logger.log(message, "INFO");
    }
    static debug(message) {
        Logger.log(message, "DEBUG");
    }
    // Única puerta a Issues fuera de throw, para errores atrapados sin rethrow
    // (background, webhooks, compensaciones): la captura automática nunca los ve.
    // Captura SIEMPRE: "esperado" modela un usuario recibiendo un 4xx, y en
    // estos contextos no hay usuario — un error tragado sin issue es invisible.
    static report(error, ctx = {}) {
        Logger.safely("report", error, () => {
            const { base, text } = (0, describeError_1.describeError)(error);
            const message = {
                ...ctx,
                title: ctx.title ?? text,
                stack: ctx.stack ?? base?.stack,
            };
            Logger.capture(error, (scope) => (0, sentryScopes_1.applyReportScope)(scope, message));
            Logger.log(message, "CRITICAL");
        });
    }
    // LA captura del pipeline de notificaciones. Acá no aplica "esperado": un
    // paciente sin notificación nunca es comportamiento esperado. Lleva tags
    // indexables de canal que report() no modela.
    static reportPipeline(error, ctx) {
        Logger.safely("reportPipeline", error, () => {
            Logger.capture(error, (scope) => (0, sentryScopes_1.applyPipelineScope)(scope, ctx));
            const { base, text } = (0, describeError_1.describeError)(error);
            Logger.log({
                title: `[${ctx.module}] ${ctx.channel} channel error`,
                hospitalId: ctx.hospitalId,
                description: text,
                stack: base?.stack,
                extra: ctx.notificationId ? `notificationId: ${ctx.notificationId}` : undefined,
            }, "CRITICAL");
        });
    }
    // ——— boundary HTTP ———
    // Solo para el errorHandler del host: el nivel sale de su política (ej.
    // ServerError.isSignal), nunca de un literal en el call site. No captura —
    // eso ya lo hizo setupExpressErrorHandler.
    static httpError(message, isSignal) {
        Logger.log(message, isSignal ? "CRITICAL" : "IMPORTANT");
    }
    // ——— internos (contrato de spies — ver doc de cabecera) ———
    // Único punto de la librería que llama Sentry.captureException fuera del
    // boundary HTTP.
    static capture(error, applyScope) {
        Sentry.withScope((scope) => {
            applyScope(scope);
            Sentry.captureException(error);
        });
    }
    // report()/reportPipeline() viven dentro de .catch: si la telemetría lanzara
    // (falla del SDK, scope corrupto), sería unhandled rejection y bajaría el
    // proceso. La telemetría nunca puede voltear al caller.
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
    // Escritor puro: consola + Sentry Logs (via consoleLoggingIntegration) +
    // breadcrumb para INFO. Nunca crea issues — eso es de report()/throw.
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
