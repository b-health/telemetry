import { LoggerMessageI, ReportDimsI, ScopeLikeI } from "./types";
import { safeStringify } from "./safeStringify";

// Kept separate from report/reportTagged so the EXACT tag keys
// (hospital.id, scope) can be tested with a plain fake scope — no SDK
// mocking. A regression here breaks Sentry dashboards/alerts without
// failing any other test.

/**
 * Applies the base tags/extras contract of every report to a Sentry scope.
 *
 * Tags (searchable): `hospital.id`, `scope`.
 * Extras (readable): `title`, `userId`, `description`, `extra` (safe-serialized).
 *
 * @param scope - A Sentry scope (or a structural fake in tests).
 * @param message - The already-composed log message.
 */
export const applyReportScope = (scope: ScopeLikeI, message: LoggerMessageI): void => {
  if (message.hospitalId) scope.setTag("hospital.id", message.hospitalId);
  if (message.scope) scope.setTag("scope", message.scope);

  scope.setExtra("title", message.title);
  if (message.userId) scope.setExtra("userId", message.userId);
  if (message.description) scope.setExtra("description", message.description);
  if (message.extra) scope.setExtra("extra", safeStringify(message.extra));
};

/**
 * Applies consumer-defined dimensions ({@link ReportDimsI}) to a Sentry scope.
 *
 * `undefined` tag/context values are skipped, so facades can pass optional
 * fields straight through without filtering.
 *
 * @param scope - A Sentry scope (or a structural fake in tests).
 * @param dims - The consumer facade's dimensions.
 */
export const applyDims = (scope: ScopeLikeI, dims: ReportDimsI): void => {
  for (const [key, value] of Object.entries(dims.tags ?? {})) {
    if (value !== undefined) scope.setTag(key, value);
  }
  for (const [key, value] of Object.entries(dims.contexts ?? {})) {
    if (value !== undefined) scope.setContext(key, value);
  }
  if (dims.user) scope.setUser(dims.user);
};
