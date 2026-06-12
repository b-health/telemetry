import { Logger, LoggerMessageI } from "./Logger";

// Boundary para tareas fire-and-forget: una promesa no awaiteada queda fuera
// del request — sin este catch su error no llega a ningún handler ni a Sentry.
export const fireAndForget = (
  task: Promise<unknown>,
  ctx: Partial<LoggerMessageI> & { title: string }
): void => {
  void task.catch((error) => Logger.report(error, ctx));
};
