"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupLoggerMock = void 0;
const Logger_1 = require("./Logger");
// Helper para suites de consumidores: silencia consola/Sentry del Logger sin
// alterar su API pública. Llamar dentro de beforeEach (los spies se limpian
// con restoreAllMocks del consumidor).
const setupLoggerMock = () => {
    jest.spyOn(Logger_1.Logger, "log").mockImplementation(() => { });
    jest.spyOn(Logger_1.Logger, "capture").mockImplementation(() => { });
    jest.spyOn(Logger_1.Logger, "breadcrumb").mockImplementation(() => { });
    jest.spyOn(Logger_1.Logger, "terminalLogger").mockImplementation(() => { });
};
exports.setupLoggerMock = setupLoggerMock;
