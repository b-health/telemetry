// Pin del spy contract DONDE se define: un rename de los estáticos privados
// (log/capture/breadcrumb/terminalLogger) o un sink nuevo no ruteado por ellos
// debe fallar acá, en CI de la lib — no en la suite de un consumidor al bumpear.
import { Logger, ScopedLogger } from "./Logger";
import { fireAndForget } from "./fireAndForget";
import { setupLoggerMock } from "./testing";

const spyConsole = () =>
  (["error", "warn", "info", "log"] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {})
  );

afterEach(() => {
  jest.restoreAllMocks();
});

describe("setupLoggerMock — spy contract", () => {
  it("silences every public verb completely (no console, no Sentry)", async () => {
    const consoleSpies = spyConsole();
    setupLoggerMock();

    Logger.info({ title: "t" });
    Logger.debug({ title: "t" });
    Logger.report(new Error("x"));
    Logger.reportTagged(new Error("x"), { tags: { a: "b" } });
    Logger.httpError({ title: "t" }, true);
    Logger.scope("S").report(new Error("x"));
    fireAndForget(Promise.reject(new Error("x")), { title: "bg" });
    await new Promise(process.nextTick);

    consoleSpies.forEach((s) => expect(s).not.toHaveBeenCalled());
  });

  it("returns the spies so consumers can assert through the helper", () => {
    const spies = setupLoggerMock();
    Logger.info({ title: "ctx" });
    expect(spies.log).toHaveBeenCalledWith({ title: "ctx" }, "INFO");
    Logger.report(new Error("boom"));
    expect(spies.capture).toHaveBeenCalledTimes(1);
  });
});

describe("subclass extension — el modo de integración del consumidor", () => {
  // oca hace `class Logger extends TelemetryLogger` con verbos propios sobre
  // reportTagged. Este pin garantiza que (a) los estáticos se heredan, (b) los
  // spies sobre la clase BASE interceptan llamadas hechas vía la subclase —
  // si los internals pasaran de `Logger.x` a `this.x`, esto se rompe acá.
  class Sub extends Logger {
    static custom(error: unknown): void {
      Sub.reportTagged(error, { tags: { module: "m", channel: "c" } });
    }
  }

  it("inherited verbs and custom facades route through the base class spies", () => {
    const spies = setupLoggerMock();
    Sub.report(new Error("a"));
    Sub.custom(new Error("b"));
    Sub.info({ title: "t" });
    expect(spies.capture).toHaveBeenCalledTimes(2);
    expect(spies.log).toHaveBeenCalledTimes(3);
  });

  it("scope() created from a subclass instance still routes through base spies", () => {
    const spies = setupLoggerMock();
    class SomeUC {
      log = Sub.scope(this);
    }
    new SomeUC().log.report(new Error("x"));
    expect(spies.capture).toHaveBeenCalledTimes(1);
    expect((Logger as any).scope).toBeDefined();
    expect(ScopedLogger).toBeDefined();
  });
});
