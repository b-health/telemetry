import { LoggerMessageI } from "./Logger";
export declare const fireAndForget: (task: Promise<unknown>, ctx: Partial<LoggerMessageI> & {
    title: string;
}) => void;
