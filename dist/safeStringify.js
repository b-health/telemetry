"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeStringify = void 0;
// Serialización para telemetría: el valor puede ser cualquier cosa (body de un
// request, objeto circular, getter envenenado) y quien loguea nunca debe caerse.
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
