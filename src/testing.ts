import { Logger } from "./Logger";

// Helper para suites de consumidores: silencia consola/Sentry del Logger sin
// alterar su API pública. Llamar dentro de beforeEach (los spies se limpian
// con restoreAllMocks del consumidor).
export const setupLoggerMock = (): void => {
  jest.spyOn(Logger as any, "log").mockImplementation(() => {});
  jest.spyOn(Logger as any, "capture").mockImplementation(() => {});
  jest.spyOn(Logger as any, "breadcrumb").mockImplementation(() => {});
  jest.spyOn(Logger as any, "terminalLogger").mockImplementation(() => {});
};
