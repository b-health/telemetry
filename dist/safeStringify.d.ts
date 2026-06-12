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
export declare const safeStringify: (value: unknown) => string;
