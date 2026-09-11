import { describeError, errorDiagnostics } from "./describeError";

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

// Contrato de la clase de bug "el diagnóstico viaja en el error y se pierde
// al imprimir": un ServerError con extraInfo (prismaCode/cause) llegaba a la
// línea de terminal como mensaje fijo + extra vacío (CU-86bbpejr6).
describe("errorDiagnostics — total function", () => {
  it("surfaces extraInfo when present (ServerError-shaped wrappers)", () => {
    const e = Object.assign(new Error("Failed to close conversation session"), {
      extraInfo: { prismaCode: "P2025", cause: "Record to update not found" },
    });
    expect(errorDiagnostics(e)).toEqual({
      extraInfo: { prismaCode: "P2025", cause: "Record to update not found" },
    });
  });

  it("falls back to the standard cause when there is no extraInfo", () => {
    const e = Object.assign(new Error("wrapper"), { cause: new Error("pool timeout") });
    expect(errorDiagnostics(e)).toEqual({ cause: "pool timeout" });
  });

  it("prefers extraInfo over cause — wrappers already embed the described cause", () => {
    const e = Object.assign(new Error("wrapper"), { cause: new Error("raw") }, {
      extraInfo: { prismaCode: "P2024" },
    });
    expect(errorDiagnostics(e)).toEqual({ extraInfo: { prismaCode: "P2024" } });
  });

  it("returns undefined for plain errors and non-Error values", () => {
    expect(errorDiagnostics(new Error("plain"))).toBeUndefined();
    expect(errorDiagnostics("raw")).toBeUndefined();
    expect(errorDiagnostics(undefined)).toBeUndefined();
  });

  it("never throws on a poisoned extraInfo getter", () => {
    class Evil extends Error {
      get extraInfo(): unknown {
        throw new Error("poisoned getter");
      }
    }
    expect(errorDiagnostics(new Evil())).toBeUndefined();
  });
});
