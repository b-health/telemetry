"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fireAndForget = void 0;
const Logger_1 = require("./Logger");
/**
 * Boundary for fire-and-forget tasks.
 *
 * An unawaited promise lives outside every request boundary: without this
 * catch, its rejection reaches no handler and no Sentry — the error simply
 * disappears (or kills the process under strict unhandled-rejection policies).
 *
 * @param task - The promise being intentionally not awaited.
 * @param ctx - Context for the report if the task rejects. `title` is
 *   required: it names the issue in Sentry (keep it short and stable).
 *
 * @example
 * fireAndForget(new SyncWorkflowUC(repo).execute(id, hospitalId), {
 *   title: "[SyncWorkflow] Failed after updateAgent",
 *   hospitalId,
 *   extra: `agentId: ${id}`,
 * });
 */
const fireAndForget = (task, ctx) => {
    void task.catch((error) => Logger_1.Logger.report(error, ctx));
};
exports.fireAndForget = fireAndForget;
