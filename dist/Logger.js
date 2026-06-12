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
exports.Logger = exports.ScopedLogger = exports.applyReportScope = exports.applyPipelineScope = void 0;
const Sentry = __importStar(require("@sentry/node"));
const safeStringify_1 = require("./safeStringify");
const describeError = (error) => {
    const base = error instanceof Error ? error : undefined;
    return { base, text: base?.message ?? String(error) };
};
// Los apply*Scope están separados de report/reportPipeline para poder testear
// los tags exactos (hospital.id, scope, module, channel) sin mockear el SDK:
// una regresión acá rompe dashboards/alerts sin que falle ningún otro test.
const applyPipelineScope = (scope, ctx) => {
    scope.setTag("module", ctx.module);
    scope.setTag("channel", ctx.channel);
    if (ctx.type)
        scope.setTag("notification_type", ctx.type);
    if (ctx.hospitalId)
        scope.setTag("hospital.id", ctx.hospitalId);
    scope.setContext("notification", {
        id: ctx.notificationId,
        hospitalId: ctx.hospitalId,
        type: ctx.type,
        channel: ctx.channel,
        sendTo: ctx.sendTo,
        patientName: ctx.patientName,
    });
    if (ctx.payload)
        scope.setContext("payload", ctx.payload);
    if (ctx.hospitalId)
        scope.setUser({ id: ctx.hospitalId });
};
exports.applyPipelineScope = applyPipelineScope;
const applyReportScope = (scope, message) => {
    if (message.hospitalId)
        scope.setTag("hospital.id", message.hospitalId);
    if (message.scope)
        scope.setTag("scope", message.scope);
    scope.setExtra("title", message.title);
    if (message.userId)
        scope.setExtra("userId", message.userId);
    if (message.description)
        scope.setExtra("description", message.description);
    if (message.extra)
        scope.setExtra("extra", (0, safeStringify_1.safeStringify)(message.extra));
};
exports.applyReportScope = applyReportScope;
// Logger con ámbito (patrón logger-per-class): el nombre del use case sale
// solo de constructor.name — nadie tipea prefijos a mano. El título queda
// "<Scope>: <evento>" (evento corto y estable = fingerprinting limpio; el
// detalle variable va en description/extra) y `scope` viaja como tag.
class ScopedLogger {
    constructor(name) {
        this.name = name;
    }
    message(event, ctx) {
        return { ...ctx, scope: this.name, title: `${this.name}: ${event}` };
    }
    info(event, ctx = {}) {
        Logger.info(this.message(event, ctx));
    }
    debug(event, ctx = {}) {
        Logger.debug(this.message(event, ctx));
    }
    report(error, ctx = {}) {
        // describeError puede tirar con un valor envenenado (toString/getter):
        // el título se deriva bajo el mismo paraguas que protege al caller —
        // este método vive en .catch handlers igual que Logger.report.
        let event;
        try {
            event = ctx.title ?? describeError(error).text;
        }
        catch {
            event = "error";
        }
        Logger.report(error, this.message(event, ctx));
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
            const { base, text } = describeError(error);
            const message = {
                ...ctx,
                title: ctx.title ?? text,
                stack: ctx.stack ?? base?.stack,
            };
            Logger.capture(error, (scope) => (0, exports.applyReportScope)(scope, message));
            Logger.log(message, "CRITICAL");
        });
    }
    // LA captura del pipeline de notificaciones. Acá no aplica "esperado": un
    // paciente sin notificación nunca es comportamiento esperado. Lleva tags
    // indexables de canal que report() no modela.
    static reportPipeline(error, ctx) {
        Logger.safely("reportPipeline", error, () => {
            Logger.capture(error, (scope) => (0, exports.applyPipelineScope)(scope, ctx));
            const { base, text } = describeError(error);
            Logger.log({
                title: `[${ctx.module}] ${ctx.channel} channel error`,
                hospitalId: ctx.hospitalId,
                description: text,
                stack: base?.stack,
                extra: ctx.notificationId ? `notificationId: ${ctx.notificationId}` : undefined,
            }, "CRITICAL");
        });
    }
    // ——— interno / boundaries ———
    // Solo para el errorHandler HTTP: el nivel sale de la política del host
    // (ej. ServerError.isSignal), nunca de un literal en el call site. No
    // captura — eso ya lo hizo setupExpressErrorHandler.
    static httpError(message, isSignal) {
        Logger.log(message, isSignal ? "CRITICAL" : "IMPORTANT");
    }
    // Único punto de la librería que llama Sentry.captureException fuera del
    // boundary HTTP.
    static capture(error, applyScope) {
        Sentry.withScope((scope) => {
            applyScope(scope);
            Sentry.captureException(error);
        });
    }
    // report()/reportPipeline() viven dentro de .catch: si la telemetría lanzara
    // (toString envenenado, falla del SDK), sería unhandled rejection y bajaría
    // el proceso. La telemetría nunca puede voltear al caller.
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
}
exports.Logger = Logger;
Logger.getColorCode = (importance = "DEBUG") => {
    if (importance === "DEBUG") {
        return "\x1b[33m"; // yellow for DEBUG
    }
    else if (importance === "IMPORTANT") {
        return "\x1b[38;5;208m"; // orange for IMPORTANT
    }
    else if (importance === "CRITICAL") {
        return "\x1b[31m\x1b[1m"; // red and bold for CRITICAL
    }
    else if (importance === "INFO") {
        return "\x1b[36m"; // cyan for INFO
    }
    return "\x1b[37m"; // default color is white
};
Logger.formatMessage = (message, importance = "DEBUG") => {
    const headerParts = [`[${importance}] ${message.title || "No Title"}`];
    if (message.hospitalId)
        headerParts.push(`HospitalId: ${message.hospitalId}`);
    if (message.userId)
        headerParts.push(`UserId: ${message.userId}`);
    headerParts.push(`ENV: ${process.env.NODE_ENV}`);
    headerParts.push(new Date().toISOString());
    const lines = [headerParts.join(" | ")];
    if (message.description)
        lines.push(`  description: ${message.description}`);
    if (message.extra)
        lines.push(`  extra: ${(0, safeStringify_1.safeStringify)(message.extra)}`);
    if (message.stack)
        lines.push(`  stack: ${message.stack}`);
    return lines.join("\n");
};
