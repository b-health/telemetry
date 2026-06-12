import { fireAndForget } from "./fireAndForget";
import { Logger } from "./Logger";

describe("fireAndForget", () => {
  let reportSpy: jest.SpyInstance;

  beforeEach(() => {
    reportSpy = jest.spyOn(Logger, "report").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reports the error with the given context when the task rejects", async () => {
    const error = new Error("boom");
    fireAndForget(Promise.reject(error), { title: "[bg] task failed", hospitalId: "5" });
    await new Promise(process.nextTick);
    expect(reportSpy).toHaveBeenCalledWith(error, { title: "[bg] task failed", hospitalId: "5" });
  });

  it("does not report when the task resolves", async () => {
    fireAndForget(Promise.resolve("ok"), { title: "[bg] task" });
    await new Promise(process.nextTick);
    expect(reportSpy).not.toHaveBeenCalled();
  });

  it("produces no unhandled rejection when the task rejects", async () => {
    const unhandled = jest.fn();
    process.once("unhandledRejection", unhandled);
    try {
      fireAndForget(Promise.reject(new Error("boom")), { title: "[bg] task" });
      await new Promise(process.nextTick);
      await new Promise(process.nextTick);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.removeListener("unhandledRejection", unhandled);
    }
  });
});
