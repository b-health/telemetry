# @b-health/telemetry

Telemetría de B.Health sobre Sentry: un Logger con vocabulario de 4 verbos, boundaries para errores tragados, y la guardia de ESLint que hace el contrato inquebrantable.

```ts
Logger.info(msg)               // breadcrumb + consola (contexto)
Logger.debug(msg)              // consola (desarrollo)
Logger.report(error, ctx)      // error atrapado sin rethrow → SIEMPRE issue
Logger.reportPipeline(e, ctx)  // fallo de envío de notificación → issue + tags de canal
Logger.scope(this | "nombre")  // mismo vocabulario con scope automático (logger-per-class)
throw                          // lo captura el boundary HTTP del host
fireAndForget(promise, ctx)    // boundary para promesas no awaiteadas
```

`CRITICAL`/`IMPORTANT` los decide la política, nunca el call site (en HTTP: `Logger.httpError(msg, isSignal)` con la política del host). La telemetría jamás lanza: `report`/`reportPipeline` están autoprotegidos.

Contrato completo y razones de diseño: `dev-wiki/wiki/patterns/telemetria_sentry.md` (repo interno).

## Instalación

```json
"dependencies": {
  "@b-health/telemetry": "github:b-health/telemetry#v1.0.0"
}
```

`@sentry/node` es **peer dependency**: el host es dueño del SDK y de su init (`instrument.ts` — DSN, sampling, `enabled`). La librería solo emite contra el SDK ya inicializado.

## ESLint guard

```js
// eslint.config.mjs del consumidor
import { telemetryGuard } from "@b-health/telemetry/eslint";

export default [
  { files: ["src/**/*.ts"], languageOptions: { parser: tsParser } },
  ...telemetryGuard({
    telemetryFiles: ["src/instrument.ts", "src/app.ts"],
    consoleFiles: ["src/index.ts"],
  }),
];
```

## Test helper

```ts
import { setupLoggerMock } from "@b-health/telemetry/testing";
beforeEach(() => setupLoggerMock());
```

## Nota de release: `dist/` va commiteado

Los consumidores instalan como **git dependency** y sus Docker builds usan `npm install --ignore-scripts`, así que `prepare` no corre en el install. Antes de taggear: `npm run build && git add dist`.
