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
