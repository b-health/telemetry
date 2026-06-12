"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeStringify = void 0;
/**
 * Defensive serialization for telemetry payloads.
 *
 * The input can be anything (request bodies, circular objects, poisoned
 * getters) and the caller is always a logging path that must never throw.
 *
 * @param value - Any value to render as a string.
 * @returns `""` for `undefined`, the value itself when it is already a string,
 *   its JSON form when serializable, `String(value)` as fallback, and
 *   `"[unserializable]"` when everything else fails.
 */
const safeStringify = (value) => {
    if (value === undefined)
        return "";
    if (typeof value === "string")
        return value;
    try {
        return JSON.stringify(value) ?? String(value);
    }
    catch {
        try {
            return String(value);
        }
        catch {
            return "[unserializable]";
        }
    }
};
exports.safeStringify = safeStringify;
