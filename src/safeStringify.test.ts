import { safeStringify } from "./safeStringify";

describe("safeStringify", () => {
  it("passes strings through untouched", () => {
    expect(safeStringify("hola")).toBe("hola");
  });

  it("returns empty string for undefined", () => {
    expect(safeStringify(undefined)).toBe("");
  });

  it("serializes plain values and objects", () => {
    expect(safeStringify({ a: 1 })).toBe('{"a":1}');
    expect(safeStringify(5)).toBe("5");
    expect(safeStringify(null)).toBe("null");
  });

  it("falls back to String() for circular objects", () => {
    const circular: any = {};
    circular.self = circular;
    expect(safeStringify(circular)).toBe("[object Object]");
  });

  it("returns [unserializable] when both JSON.stringify and String throw", () => {
    const poisoned = {
      toJSON() {
        throw new Error("poisoned toJSON");
      },
      toString() {
        throw new Error("poisoned toString");
      },
    };
    expect(safeStringify(poisoned)).toBe("[unserializable]");
  });
});
