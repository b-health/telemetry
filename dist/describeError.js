"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeError = void 0;
// Total: nunca lanza, ni con getters/toString envenenados — sus callers viven
// dentro de .catch handlers donde una excepción sería unhandled rejection.
const describeError = (error) => {
    try {
        const base = error instanceof Error ? error : undefined;
        return { base, text: base?.message ?? String(error) };
    }
    catch {
        return { text: "[undescribable error]" };
    }
};
exports.describeError = describeError;
