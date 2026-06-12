import { LogImportance, LoggerMessageI } from "./types";
export declare const formatMessage: (message: LoggerMessageI, importance: LogImportance) => string;
export declare const writeToTerminal: (importance: LogImportance, message: LoggerMessageI) => void;
