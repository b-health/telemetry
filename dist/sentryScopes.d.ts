import { LoggerMessageI, PipelineCtxI, ScopeLikeI } from "./types";
export declare const applyReportScope: (scope: ScopeLikeI, message: LoggerMessageI) => void;
export declare const applyPipelineScope: (scope: ScopeLikeI, ctx: PipelineCtxI) => void;
