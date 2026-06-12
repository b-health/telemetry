import { Logger } from "./Logger";

/**
 * Silences the Logger for consumer test suites without touching its public
 * API: console output, Sentry captures and breadcrumbs all become no-ops.
 *
 * Call inside `beforeEach` — the spies are cleaned by the consumer's
 * `restoreAllMocks`. Spies target the private statics
 * `log`/`capture`/`breadcrumb`/`terminalLogger` (the library's stable spy
 * contract; see the header of `Logger.ts`).
 *
 * @example
 * import { setupLoggerMock } from "@b-health/telemetry/testing";
 * beforeEach(() => setupLoggerMock());
 */
export const setupLoggerMock = (): void => {
  jest.spyOn(Logger as any, "log").mockImplementation(() => {});
  jest.spyOn(Logger as any, "capture").mockImplementation(() => {});
  jest.spyOn(Logger as any, "breadcrumb").mockImplementation(() => {});
  jest.spyOn(Logger as any, "terminalLogger").mockImplementation(() => {});
};
