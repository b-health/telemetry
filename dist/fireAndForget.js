"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fireAndForget = void 0;
const Logger_1 = require("./Logger");
// Boundary para tareas fire-and-forget: una promesa no awaiteada queda fuera
// del request — sin este catch su error no llega a ningún handler ni a Sentry.
const fireAndForget = (task, ctx) => {
    void task.catch((error) => Logger_1.Logger.report(error, ctx));
};
exports.fireAndForget = fireAndForget;
