export type LogImportance = "CRITICAL" | "IMPORTANT" | "INFO" | "DEBUG";
export interface LoggerMessageI {
    hospitalId?: string;
    userId?: string;
    title: string;
    description?: string;
    stack?: string;
    extra?: unknown;
    scope?: string;
}
export interface PipelineCtxI {
    module: string;
    channel: string;
    type?: string;
    hospitalId?: string;
    notificationId?: string;
    sendTo?: string;
    patientName?: string;
    payload?: Record<string, any>;
}
export interface ScopeLikeI {
    setTag(key: string, value: string): unknown;
    setContext(key: string, value: Record<string, any>): unknown;
    setUser(user: {
        id: string;
    }): unknown;
    setExtra(key: string, value: unknown): unknown;
}
export declare const applyPipelineScope: (scope: ScopeLikeI, ctx: PipelineCtxI) => void;
export declare const applyReportScope: (scope: ScopeLikeI, message: LoggerMessageI) => void;
export declare class ScopedLogger {
    private readonly name;
    constructor(name: string);
    private message;
    info(event: string, ctx?: Partial<LoggerMessageI>): void;
    debug(event: string, ctx?: Partial<LoggerMessageI>): void;
    report(error: unknown, ctx?: Partial<LoggerMessageI>): void;
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
    private static getColorCode;
    private static formatMessage;
}
