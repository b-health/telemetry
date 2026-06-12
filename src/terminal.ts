import { LogImportance, LoggerMessageI } from "./types";
import { safeStringify } from "./safeStringify";

const RESET = "\x1b[37m";

const RENDER: Record<LogImportance, { color: string; write: (line: string) => void }> = {
  CRITICAL: { color: "\x1b[31m\x1b[1m", write: (line) => console.error(line) },
  IMPORTANT: { color: "\x1b[38;5;208m", write: (line) => console.warn(line) },
  INFO: { color: "\x1b[36m", write: (line) => console.info(line) },
  DEBUG: { color: "\x1b[33m", write: (line) => console.log(line) },
};

export const formatMessage = (message: LoggerMessageI, importance: LogImportance): string => {
  const header = [
    `[${importance}] ${message.title || "No Title"}`,
    message.hospitalId && `HospitalId: ${message.hospitalId}`,
    message.userId && `UserId: ${message.userId}`,
    `ENV: ${process.env.NODE_ENV}`,
    new Date().toISOString(),
  ]
    .filter(Boolean)
    .join(" | ");

  const details = [
    message.description && `  description: ${message.description}`,
    message.extra && `  extra: ${safeStringify(message.extra)}`,
    message.stack && `  stack: ${message.stack}`,
  ].filter(Boolean);

  return [header, ...details].join("\n");
};

export const writeToTerminal = (importance: LogImportance, message: LoggerMessageI): void => {
  const { color, write } = RENDER[importance] ?? RENDER.DEBUG;
  write(`${color}${formatMessage(message, importance)}${RESET}`);
};
