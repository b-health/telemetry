// Pin del único punto que llama Sentry.captureException fuera del boundary
// HTTP: todos los demás tests mockean Logger.capture, así que una regresión
// adentro (no llamar captureException, invertir argumentos) pasaría en verde.
//
// setup.ts (setupFilesAfterEach) ya cargó Logger.class con el @sentry/node
// real antes de que corra este archivo, así que el jest.mock de arriba no le
// llega a ese módulo cacheado: hay que resetear el registry y requerir Logger
// y Sentry frescos DENTRO del test para que compartan la instancia mockeada.
jest.mock("@sentry/node", () => ({
  withScope: jest.fn((cb: (scope: any) => void) =>
    cb({ setTag: jest.fn(), setContext: jest.fn(), setUser: jest.fn(), setExtra: jest.fn() })
  ),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

const freshLoggerWithSentryMock = () => {
  jest.resetModules();
  const SentryMock = require("@sentry/node");
  const { Logger } = require("./Logger");
  return { SentryMock, Logger };
};

describe("Logger.capture → Sentry SDK", () => {
  beforeEach(() => {
    // El Logger fresco escribe a consola de verdad — silenciarla acá.
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("report() forwards the original error to captureException inside withScope", () => {
    const { SentryMock, Logger } = freshLoggerWithSentryMock();
    const error = new Error("boom");
    Logger.report(error);
    expect(SentryMock.withScope).toHaveBeenCalledTimes(1);
    expect(SentryMock.captureException).toHaveBeenCalledWith(error);
  });

  it("reportTagged() also goes through the same capture path", () => {
    const { SentryMock, Logger } = freshLoggerWithSentryMock();
    const error = new Error("send failed");
    Logger.reportTagged(error, { tags: { module: "appointment", channel: "WHATSAPP" } });
    expect(SentryMock.captureException).toHaveBeenCalledWith(error);
  });
});
