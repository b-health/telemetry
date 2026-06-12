import { describeError } from "./describeError";

// El contrato "NEVER throws" es load-bearing fuera de los guards de la lib:
// las facades de consumidores lo llaman durante la evaluación de argumentos,
// ANTES de que safely() los proteja.
describe("describeError — total function", () => {
  it("describes an Error instance", () => {
    const e = new Error("boom");
    expect(describeError(e)).toEqual({ base: e, text: "boom" });
  });

  it("stringifies non-Error values", () => {
    expect(describeError("raw").text).toBe("raw");
    expect(describeError(42).text).toBe("42");
    expect(describeError(null).text).toBe("null");
    expect(describeError(undefined).text).toBe("undefined");
  });

  it("never throws on a poisoned toString", () => {
    const poisoned = {
      toString() {
        throw new Error("poisoned");
      },
    };
    expect(describeError(poisoned)).toEqual({ text: "[undescribable error]" });
  });

  it("never throws on an Error subclass with a poisoned message getter", () => {
    class Evil extends Error {
      get message(): string {
        throw new Error("poisoned getter");
      }
    }
    expect(() => describeError(new Evil())).not.toThrow();
  });
});
