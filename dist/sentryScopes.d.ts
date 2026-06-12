import { LoggerMessageI, PipelineCtxI, ScopeLikeI } from "./types";
/**
 * Applies the tags/extras contract of {@link Logger.report} to a Sentry scope.
 *
 * Tags (searchable): `hospital.id`, `scope`.
 * Extras (readable): `title`, `userId`, `description`, `extra` (safe-serialized).
 *
 * @param scope - A Sentry scope (or a structural fake in tests).
 * @param message - The already-composed log message.
 */
export declare const applyReportScope: (scope: ScopeLikeI, message: LoggerMessageI) => void;
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
export declare const applyPipelineScope: (scope: ScopeLikeI, ctx: PipelineCtxI) => void;
