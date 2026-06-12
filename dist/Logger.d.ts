import { LoggerMessageI, PipelineCtxI } from "./types";
export declare class ScopedLogger {
    private readonly name;
    constructor(name: string);
    info(event: string, ctx?: Partial<LoggerMessageI>): void;
    debug(event: string, ctx?: Partial<LoggerMessageI>): void;
    report(error: unknown, ctx?: Partial<LoggerMessageI>): void;
    private message;
}
export declare class Logger {
    static scope(source: object | string): ScopedLogger;
    static info(message: LoggerMessageI): void;
    static debug(message: LoggerMessageI): void;
    static report(error: unknown, ctx?: Partial<LoggerMessageI>): void;
    static reportPipeline(error: unknown, ctx: PipelineCtxI): void;
    static httpError(message: LoggerMessageI, isSignal: boolean): void;
    private static capture;
    private static safely;
    private static log;
    private static breadcrumb;
    private static terminalLogger;
}
