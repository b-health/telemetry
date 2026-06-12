import { LoggerMessageI, PipelineCtxI, ScopeLikeI } from "./types";
import { safeStringify } from "./safeStringify";

// Separados de report/reportPipeline para poder testear los tags exactos
// (hospital.id, scope, module, channel) sin mockear el SDK: una regresión
// acá rompe dashboards/alerts sin que falle ningún otro test.

export const applyReportScope = (scope: ScopeLikeI, message: LoggerMessageI): void => {
  if (message.hospitalId) scope.setTag("hospital.id", message.hospitalId);
  if (message.scope) scope.setTag("scope", message.scope);

  scope.setExtra("title", message.title);
  if (message.userId) scope.setExtra("userId", message.userId);
  if (message.description) scope.setExtra("description", message.description);
  if (message.extra) scope.setExtra("extra", safeStringify(message.extra));
};

export const applyPipelineScope = (scope: ScopeLikeI, ctx: PipelineCtxI): void => {
  scope.setTag("module", ctx.module);
  scope.setTag("channel", ctx.channel);
  if (ctx.type) scope.setTag("notification_type", ctx.type);
  if (ctx.hospitalId) scope.setTag("hospital.id", ctx.hospitalId);

  scope.setContext("notification", {
    id: ctx.notificationId,
    hospitalId: ctx.hospitalId,
    type: ctx.type,
    channel: ctx.channel,
    sendTo: ctx.sendTo,
    patientName: ctx.patientName,
  });
  if (ctx.payload) scope.setContext("payload", ctx.payload);
  if (ctx.hospitalId) scope.setUser({ id: ctx.hospitalId });
};
