import { LoggerMessageI } from "./types";
export declare const fireAndForget: (task: Promise<unknown>, ctx: Partial<LoggerMessageI> & {
    title: string;
}) => void;
