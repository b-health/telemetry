"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupLoggerMock = void 0;
const Logger_1 = require("./Logger");
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
const setupLoggerMock = () => {
    jest.spyOn(Logger_1.Logger, "log").mockImplementation(() => { });
    jest.spyOn(Logger_1.Logger, "capture").mockImplementation(() => { });
    jest.spyOn(Logger_1.Logger, "breadcrumb").mockImplementation(() => { });
    jest.spyOn(Logger_1.Logger, "terminalLogger").mockImplementation(() => { });
};
exports.setupLoggerMock = setupLoggerMock;
