import { LoggerMessageI, ReportDimsI, ScopeLikeI } from "./types";
/**
 * Applies the base tags/extras contract of every report to a Sentry scope.
 *
 * Tags (searchable): `hospital.id`, `scope`.
 * Extras (readable): `title`, `userId`, `description`, `extra` (safe-serialized).
 *
 * @param scope - A Sentry scope (or a structural fake in tests).
 * @param message - The already-composed log message.
 */
export declare const applyReportScope: (scope: ScopeLikeI, message: LoggerMessageI) => void;
/**
 * Applies consumer-defined dimensions ({@link ReportDimsI}) to a Sentry scope.
 *
 * `undefined` tag/context values are skipped, so facades can pass optional
 * fields straight through without filtering.
 *
 * @param scope - A Sentry scope (or a structural fake in tests).
 * @param dims - The consumer facade's dimensions.
 */
export declare const applyDims: (scope: ScopeLikeI, dims: ReportDimsI) => void;
