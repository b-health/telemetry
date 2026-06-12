import { Logger } from "./Logger";
import { applyReportScope, applyDims } from "./sentryScopes";

const spyCapture = () => jest.spyOn(Logger as any, "capture").mockImplementation(() => {});
const spyLog = () => jest.spyOn(Logger as any, "log").mockImplementation(() => {});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Logger.report()", () => {
  let captureSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    captureSpy = spyCapture();
    logSpy = spyLog();
  });

  it("captures the original error and logs CRITICAL with title/stack", () => {
    const error = new Error("boom");
    Logger.report(error, { hospitalId: "5" });
    expect(captureSpy).toHaveBeenCalledWith(error, expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "boom", hospitalId: "5", stack: error.stack }),
      "CRITICAL"
    );
  });

  it("always captures — report es para errores tragados, siempre señal", () => {
    Logger.report(new Error("expected-by-some-domain"));
    expect(captureSpy).toHaveBeenCalled();
  });

  it("never throws even if the error value is poisoned (telemetry must not kill the caller)", () => {
    captureSpy.mockImplementation(() => {
      throw new Error("sdk down");
    });
    const poisoned = {
      get message() {
        throw new Error("poisoned getter");
      },
      toString() {
        throw new Error("poisoned toString");
      },
    };
    expect(() => Logger.report(poisoned)).not.toThrow();
  });

  it("prefers ctx.title over the error message", () => {
    Logger.report(new Error("boom"), { title: "[background] SyncWorkflow failed" });
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "[background] SyncWorkflow failed" }),
      "CRITICAL"
    );
  });

  it("stringifies non-Error values as title and captures them", () => {
    Logger.report("string failure");
    expect(captureSpy).toHaveBeenCalledWith("string failure", expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "string failure" }), "CRITICAL");
  });
});

// Pin de los tags/extras: una regresión acá rompe la búsqueda por hospital.id /
// scope / module / channel en Sentry sin que falle ningún otro test.
describe("applyReportScope()", () => {
  const fakeScope = () => ({ setTag: jest.fn(), setContext: jest.fn(), setUser: jest.fn(), setExtra: jest.fn() });

  it("tags hospital.id and scope, sets title/description/extra as extras", () => {
    const scope = fakeScope();
    applyReportScope(scope, {
      title: "sync failed",
      hospitalId: "5",
      scope: "SyncWorkflow",
      userId: "u1",
      description: "kapso timeout",
      extra: { attempt: 2 },
    });

    expect(scope.setTag).toHaveBeenCalledWith("hospital.id", "5");
    expect(scope.setTag).toHaveBeenCalledWith("scope", "SyncWorkflow");
    expect(scope.setExtra).toHaveBeenCalledWith("title", "sync failed");
    expect(scope.setExtra).toHaveBeenCalledWith("userId", "u1");
    expect(scope.setExtra).toHaveBeenCalledWith("description", "kapso timeout");
    expect(scope.setExtra).toHaveBeenCalledWith("extra", JSON.stringify({ attempt: 2 }));
  });

  it("skips optional tags when the message is minimal", () => {
    const scope = fakeScope();
    applyReportScope(scope, { title: "bare" });
    expect(scope.setTag).not.toHaveBeenCalled();
    expect(scope.setExtra).toHaveBeenCalledWith("title", "bare");
  });
});

describe("applyDims()", () => {
  const fakeScope = () => ({ setTag: jest.fn(), setContext: jest.fn(), setUser: jest.fn(), setExtra: jest.fn() });

  it("applies tags, contexts and user", () => {
    const scope = fakeScope();
    applyDims(scope, {
      tags: { module: "appointment", channel: "WHATSAPP" },
      contexts: { notification: { id: "n1" } },
      user: { id: "5" },
    });

    expect(scope.setTag).toHaveBeenCalledWith("module", "appointment");
    expect(scope.setTag).toHaveBeenCalledWith("channel", "WHATSAPP");
    expect(scope.setContext).toHaveBeenCalledWith("notification", { id: "n1" });
    expect(scope.setUser).toHaveBeenCalledWith({ id: "5" });
  });

  it("skips undefined tags/contexts and missing user — facades pass optionals straight through", () => {
    const scope = fakeScope();
    applyDims(scope, {
      tags: { module: "prescription", notification_type: undefined },
      contexts: { payload: undefined },
    });
    expect(scope.setTag).toHaveBeenCalledWith("module", "prescription");
    expect(scope.setTag).not.toHaveBeenCalledWith("notification_type", expect.anything());
    expect(scope.setContext).not.toHaveBeenCalled();
    expect(scope.setUser).not.toHaveBeenCalled();
  });
});

describe("Logger.reportTagged()", () => {
  it("captures with base scope + dims and logs CRITICAL with the given title", () => {
    const captureSpy = spyCapture();
    const logSpy = spyLog();
    const error = new Error("send failed");
    Logger.reportTagged(
      error,
      { tags: { module: "appointment", channel: "WHATSAPP" } },
      { hospitalId: "5", title: "[appointment] WHATSAPP channel error" }
    );
    expect(captureSpy).toHaveBeenCalledWith(error, expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "[appointment] WHATSAPP channel error",
        hospitalId: "5",
        stack: error.stack,
      }),
      "CRITICAL"
    );
  });

  it("report() delegates to reportTagged with empty dims (single capture path)", () => {
    const captureSpy = spyCapture();
    spyLog();
    Logger.report(new Error("boom"));
    expect(captureSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Logger.httpError()", () => {
  it("derives the level from the host policy: signal → CRITICAL, expected → IMPORTANT", () => {
    const logSpy = spyLog();
    Logger.httpError({ title: "boom" }, true);
    expect(logSpy).toHaveBeenCalledWith({ title: "boom" }, "CRITICAL");
    Logger.httpError({ title: "not found" }, false);
    expect(logSpy).toHaveBeenCalledWith({ title: "not found" }, "IMPORTANT");
  });
});

describe("Logger.scope()", () => {
  let captureSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    captureSpy = spyCapture();
    logSpy = spyLog();
  });

  it("derives the scope from the instance class name", () => {
    class HandleInboundMessageUC {
      log = Logger.scope(this);
    }
    new HandleInboundMessageUC().log.info("dedup_skipped");
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "HandleInboundMessageUC: dedup_skipped", scope: "HandleInboundMessageUC" }),
      "INFO"
    );
  });

  it("accepts a string scope for module-level loggers", () => {
    Logger.scope("hisSync.macena").debug("token_refreshed");
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "hisSync.macena: token_refreshed", scope: "hisSync.macena" }),
      "DEBUG"
    );
  });

  it("report never throws on poisoned values (the title derives inside the guard)", () => {
    captureSpy.mockImplementation(() => {
      throw new Error("sdk down");
    });
    const poisoned = {
      get message() {
        throw new Error("poisoned getter");
      },
      toString() {
        throw new Error("poisoned toString");
      },
    };
    expect(() => Logger.scope("Poisoned").report(poisoned)).not.toThrow();
  });

  it("report prefixes the scope and logs it as part of the message", () => {
    const error = new Error("no_hospital_mapping");
    Logger.scope("ConversationWebhook").report(error, { description: "account=123" });
    expect(captureSpy).toHaveBeenCalledWith(error, expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "ConversationWebhook: no_hospital_mapping",
        scope: "ConversationWebhook",
        description: "account=123",
      }),
      "CRITICAL"
    );
  });
});
