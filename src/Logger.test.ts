import { Logger } from "./Logger";
import { applyReportScope, applyPipelineScope } from "./sentryScopes";

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

describe("applyPipelineScope()", () => {
  const fakeScope = () => ({ setTag: jest.fn(), setContext: jest.fn(), setUser: jest.fn(), setExtra: jest.fn() });

  it("tags module/channel/notification_type/hospital.id and sets contexts + user", () => {
    const scope = fakeScope();
    applyPipelineScope(scope, {
      module: "appointment",
      channel: "WHATSAPP",
      type: "REMINDER",
      hospitalId: "5",
      notificationId: "n1",
      sendTo: "+549351...",
      payload: { code: "abc" },
    });

    expect(scope.setTag).toHaveBeenCalledWith("module", "appointment");
    expect(scope.setTag).toHaveBeenCalledWith("channel", "WHATSAPP");
    expect(scope.setTag).toHaveBeenCalledWith("notification_type", "REMINDER");
    expect(scope.setTag).toHaveBeenCalledWith("hospital.id", "5");
    expect(scope.setUser).toHaveBeenCalledWith({ id: "5" });
    expect(scope.setContext).toHaveBeenCalledWith("notification", expect.objectContaining({ id: "n1" }));
    expect(scope.setContext).toHaveBeenCalledWith("payload", { code: "abc" });
  });

  it("skips optional tags/user when ctx is minimal", () => {
    const scope = fakeScope();
    applyPipelineScope(scope, { module: "prescription", channel: "EMAIL" });
    expect(scope.setTag).toHaveBeenCalledWith("module", "prescription");
    expect(scope.setTag).toHaveBeenCalledWith("channel", "EMAIL");
    expect(scope.setTag).not.toHaveBeenCalledWith("hospital.id", expect.anything());
    expect(scope.setUser).not.toHaveBeenCalled();
  });
});

describe("Logger.reportPipeline()", () => {
  it("always logs CRITICAL with channel context", () => {
    const captureSpy = spyCapture();
    const logSpy = spyLog();
    const error = new Error("send failed");
    Logger.reportPipeline(error, { module: "appointment", channel: "WHATSAPP", hospitalId: "5", notificationId: "n1" });
    expect(captureSpy).toHaveBeenCalledWith(error, expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "[appointment] WHATSAPP channel error",
        hospitalId: "5",
        description: "send failed",
        extra: "notificationId: n1",
      }),
      "CRITICAL"
    );
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
