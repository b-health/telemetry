// Serialización para telemetría: el valor puede ser cualquier cosa (body de un
// request, objeto circular, getter envenenado) y quien loguea nunca debe caerse.
export const safeStringify = (value: unknown): string => {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    try {
      return String(value);
    } catch {
      return "[unserializable]";
    }
  }
};
