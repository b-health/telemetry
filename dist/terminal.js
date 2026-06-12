"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeToTerminal = exports.formatMessage = void 0;
const safeStringify_1 = require("./safeStringify");
const RESET = "\x1b[0m"; // reset real: limpia color Y bold (37m era "set white" y dejaba el bold de CRITICAL)
const RENDER = {
    CRITICAL: { color: "\x1b[31m\x1b[1m", write: (line) => console.error(line) },
    IMPORTANT: { color: "\x1b[38;5;208m", write: (line) => console.warn(line) },
    INFO: { color: "\x1b[36m", write: (line) => console.info(line) },
    DEBUG: { color: "\x1b[33m", write: (line) => console.log(line) },
};
const formatMessage = (message, importance) => {
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
        message.extra && `  extra: ${(0, safeStringify_1.safeStringify)(message.extra)}`,
        message.stack && `  stack: ${message.stack}`,
    ].filter(Boolean);
    return [header, ...details].join("\n");
};
exports.formatMessage = formatMessage;
const writeToTerminal = (importance, message) => {
    const { color, write } = RENDER[importance] ?? RENDER.DEBUG;
    write(`${color}${(0, exports.formatMessage)(message, importance)}${RESET}`);
};
exports.writeToTerminal = writeToTerminal;
