"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPipelineScope = exports.applyReportScope = void 0;
const safeStringify_1 = require("./safeStringify");
// Kept separate from report/reportPipeline so the EXACT tag keys
// (hospital.id, scope, module, channel) can be tested with a plain fake scope
// — no SDK mocking. A regression here breaks Sentry dashboards/alerts without
// failing any other test.
/**
 * Applies the tags/extras contract of {@link Logger.report} to a Sentry scope.
 *
 * Tags (searchable): `hospital.id`, `scope`.
 * Extras (readable): `title`, `userId`, `description`, `extra` (safe-serialized).
 *
 * @param scope - A Sentry scope (or a structural fake in tests).
 * @param message - The already-composed log message.
 */
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
/**
 * Applies the tags/contexts contract of {@link Logger.reportPipeline} to a
 * Sentry scope.
 *
 * Tags (searchable): `module`, `channel`, `notification_type`, `hospital.id`.
 * Contexts (readable): `notification` (id, destination, patient), `payload`.
 * Also sets the Sentry user to the hospital for per-tenant grouping.
 *
 * @param scope - A Sentry scope (or a structural fake in tests).
 * @param ctx - The pipeline failure context.
 */
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
