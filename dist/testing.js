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
 * contract; see the header of `Logger.ts` — pinned by `testing.test.ts`).
 *
 * Returns the spies so consumer tests can ASSERT through the helper instead
 * of re-spying privates ad hoc (one place to adapt if the contract evolves).
 *
 * @example
 * import { setupLoggerMock } from "@b-health/telemetry/testing";
 * beforeEach(() => setupLoggerMock());
 *
 * @example
 * // asserting emissions in a specific test:
 * const spies = setupLoggerMock();
 * runThingThatLogs();
 * expect(spies.log).toHaveBeenCalledWith(expect.objectContaining({ title: "x" }), "INFO");
 */
const setupLoggerMock = () => {
    return {
        log: jest.spyOn(Logger_1.Logger, "log").mockImplementation(() => { }),
        capture: jest.spyOn(Logger_1.Logger, "capture").mockImplementation(() => { }),
        breadcrumb: jest.spyOn(Logger_1.Logger, "breadcrumb").mockImplementation(() => { }),
        terminalLogger: jest.spyOn(Logger_1.Logger, "terminalLogger").mockImplementation(() => { }),
    };
};
exports.setupLoggerMock = setupLoggerMock;
