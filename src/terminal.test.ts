import { formatMessage, writeToTerminal } from "./terminal";

// Lo que los operadores leen en prod: el formato no puede regresionar invisible
// (todas las suites de Logger mockean terminalLogger).
describe("formatMessage", () => {
  it("renders the full header and detail lines", () => {
    const out = formatMessage(
      { title: "send failed", hospitalId: "5", userId: "u1", description: "d", extra: { a: 1 }, stack: "STACK" },
      "CRITICAL"
    );
    expect(out).toContain("[CRITICAL] send failed");
    expect(out).toContain("HospitalId: 5");
    expect(out).toContain("UserId: u1");
    expect(out).toContain('  extra: {"a":1}');
    expect(out).toContain("  stack: STACK");
  });

  it("falls back to 'No Title' and skips absent parts", () => {
    const out = formatMessage({ title: "" }, "DEBUG");
    expect(out).toContain("[DEBUG] No Title");
    expect(out).not.toContain("HospitalId");
    expect(out.split("\n")).toHaveLength(1);
  });

  it("survives circular extra via safeStringify", () => {
    const circular: any = {};
    circular.self = circular;
    expect(() => formatMessage({ title: "t", extra: circular }, "INFO")).not.toThrow();
  });
});

describe("writeToTerminal", () => {
  it("routes CRITICAL to console.error with a real ANSI reset", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    writeToTerminal("CRITICAL", { title: "boom" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain("[CRITICAL] boom");
    expect(line.endsWith("\x1b[0m")).toBe(true); // reset real, no "set white"
    spy.mockRestore();
  });

  it("falls back to DEBUG rendering for unknown importance", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    writeToTerminal("NOPE" as any, { title: "t" });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
