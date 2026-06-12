# @b-health/telemetry

El vocabulario de telemetría de B.Health: una sola forma de loguear, reportar errores y alimentar Sentry desde cualquier servicio — con el contrato enforced por ESLint para que no se degrade con el tiempo.

## Por qué existe

Nació de una auditoría real (junio 2026): ~25.000 eventos de Sentry en 14 días, la mayoría ruido, y los errores graves **invisibles** — crons con catch vacío, promesas fire-and-forget muriendo en silencio, `console.error` que no llegaba a ningún lado, y dos servicios (api/oca) con copias "espejadas" del Logger que ya habían divergido.

La librería resuelve las tres cosas a la vez:

1. **Nada importante puede ser invisible** — todo error tragado tiene un camino obligatorio a Sentry.
2. **Nada irrelevante crea ruido** — los niveles los decide la política, no el dev de turno.
3. **El contrato no se degrada** — las reglas de lint viajan con el paquete; violarlo no compila la review.

## El modelo mental (esto es lo único que hay que internalizar)

Cuando estás escribiendo código y pasa algo, te hacés **una sola pregunta**:

> **¿Puedo manejar este error y seguir, o no?**

| Situación | Qué hacés | Qué produce |
|---|---|---|
| No lo puedo manejar | `throw` | El boundary HTTP del host lo captura y responde |
| Lo manejo/trago y sigo | `Logger.report(error, ctx)` | **Siempre** un issue en Sentry + log |
| Falló algo de TU dominio con dimensiones propias | la facade de tu servicio (ej. `reportPipeline` en oca) → `Logger.reportTagged` | Issue con tags de tu dominio |
| Pasó algo que da contexto | `Logger.info(msg)` | Breadcrumb (viaja pegado al próximo issue) + consola |
| Ruido de desarrollo | `Logger.debug(msg)` | Solo consola, jamás Sentry |
| Disparo una promesa sin await | `fireAndForget(promise, ctx)` | Si rechaza → issue; si no, nada |

No existe "elegir el nivel": `CRITICAL`/`IMPORTANT` los decide la política internamente. Si te encontrás escribiendo `"CRITICAL"` a mano, el lint te va a frenar — y es señal de que querías `report()`.

### Por qué `report()` captura SIEMPRE (hasta los errores "esperados")

"Error esperado" modela un usuario recibiendo un 4xx ("turno ya confirmado"). Pero `report()` se usa donde **no hay usuario**: webhooks, background, compensaciones. Ahí, un error tragado sin issue es un paciente ignorado que nadie ve. La distinción esperado/señal existe — pero vive en el boundary HTTP del host, no acá.

## Los tres destinos en Sentry (y cómo se relacionan)

```
ISSUES        ← lo que hay que ARREGLAR (report/reportTagged/throw)
                agrupado por título estable, filtrable por tags
SENTRY LOGS   ← lo que PASÓ (console.warn/error vía consoleLoggingIntegration del host)
BREADCRUMBS   ← cómo LLEGÓ acá (los info() del mismo request, adjuntos al issue)
```

La regla de oro de los datos: **si lo vas a buscar, es tag; si lo vas a leer, es breadcrumb/extra.** Tags que esta lib garantiza: `hospital.id` (multi-tenant), `scope` (módulo de origen), y en pipeline `module`/`channel`/`notification_type`. Una query como `hospital.id:5 channel:WHATSAPP` cruza todo el sistema.

Por eso `title` debe ser **corto y estable** (`"no_hospital_mapping"`) — Sentry agrupa por él. El dato variable (ids, cuentas) va en `description`/`extra`, nunca en el título: un título con interpolación = mil issues de uno.

## Uso

### En una clase (el patrón recomendado: logger-per-class)

```ts
import { Logger } from "@b-health/telemetry";

export class HandleInboundMessageUC {
  private readonly log = Logger.scope(this); // scope = "HandleInboundMessageUC", automático

  async execute(event: WaNormalizedEvent) {
    if (!waAccount) {
      // evento descartado = paciente ignorado → issue, con título estable
      this.log.report(new Error("no_hospital_mapping"), {
        description: `accountIdentifier: "${event.account}"`,
      });
      return null;
    }
    this.log.info("dedup_skipped", { description: event.messageId }); // breadcrumb
  }
}
```

El scope sale de `constructor.name` — nadie tipea prefijos, imposible escribirlo mal — y viaja como tag `scope` filtrable.

### Error tragado (catch sin rethrow)

```ts
} catch (error) {
  Logger.report(error, { title: "[submitTemplate] rollback failed", hospitalId });
  return null; // el flujo sigue — pero la falla ya existe en Sentry
}
```

### Familias de fallos con dimensiones propias: el patrón facade

La lib NO conoce tu dominio. Cuando una familia de errores necesita tags propios
(ej. fallos de envío en oca, fallos de HIS sync en api), tu servicio define una
facade tipada sobre `reportTagged` — el type system de TU repo exige TUS dimensiones:

```ts
// oca/src/Common/domain/reportPipeline.ts — el vocabulario es del consumidor
export const reportPipeline = (error: unknown, ctx: PipelineCtxI): void =>
  Logger.reportTagged(error, {
    tags: { module: ctx.module, channel: ctx.channel, "notification_type": ctx.type },
    contexts: { notification: { id: ctx.notificationId, sendTo: ctx.sendTo } },
    user: ctx.hospitalId ? { id: ctx.hospitalId } : undefined,
  }, { hospitalId: ctx.hospitalId, title: `[${ctx.module}] ${ctx.channel} channel error` });
```

La garantía de "ningún fallo sin dimensiones" no se pierde: la enforcea el tipo
de la facade, que vive donde vive el dominio. La lib garantiza el mecanismo
(siempre issue, nunca lanza, tags base aplicados).

### Promesa sin await

```ts
import { fireAndForget } from "@b-health/telemetry";

fireAndForget(new SyncWorkflowUC(repo).execute(id, hospitalId), {
  title: "[SyncWorkflow] Failed after updateAgent",
  hospitalId,
});
```

### Garantía transversal: la telemetría jamás voltea al caller

`report()`/`reportTagged()` están autoprotegidos: un `toString` envenenado o una falla del SDK dentro de un `.catch` no se convierte en unhandled rejection. Lo peor que puede pasar es un `console.error` de fallback.

## Arquitectura: qué es de la lib y qué es del host

```
┌─ TU SERVICIO (host) ──────────────────────────────────────┐
│  instrument.ts   → dueño del SDK: DSN, sampling, enabled   │
│  errorHandler    → política HTTP: isSignal/isExpected      │
│                    → Logger.httpError(msg, isSignal)       │
│  call sites      → solo el vocabulario (report/info/...)   │
├─ @b-health/telemetry ─────────────────────────────────────┤
│  Logger          → orquestación + niveles (la política)    │
│  sentryScopes    → contrato exacto de tags (testeado)      │
│  terminal        → rendering de consola                    │
│  eslint preset   → la guardia que enforcea todo lo de arriba│
└───────────────────────────────────────────────────────────┘
```

Decisiones de diseño que conviene conocer:

- **`@sentry/node` es peer dependency.** La lib no conoce el DSN ni puede inicializar Sentry: emite contra el SDK que el host configuró. Host = dueño del vendor; lib = dueña del vocabulario. Si algún día se cambia de vendor, el radio de impacto es un archivo de esta lib — los call sites no se enteran.
- **La clasificación esperado/señal es del host** (ej. `ServerError.isSignal`), por eso `httpError()` recibe el booleano en vez de conocer la jerarquía de errores de cada servicio.
- **Ningún consumidor importa `@sentry/*`** — regla de lint. La única puerta a Issues fuera de `throw` es `report()`/`reportTagged()` (y las facades que lo envuelven).

## Integración en un servicio nuevo

```jsonc
// 1. package.json
"dependencies": { "@b-health/telemetry": "github:b-health/telemetry#v2.0.0" }
```

```ts
// 2. instrument.ts (host) — primer import del proceso. La lib NO hace esto.
Sentry.init({ dsn, enabled: isProduction, /* sampling, integrations... */ });
```

```ts
// 3. errorHandler (host) — la política HTTP es tuya:
Sentry.setupExpressErrorHandler(app, { shouldHandleError: (e) => ServerError.isSignal(e) });
// y en el middleware: Logger.httpError(message, ServerError.isSignal(error));
```

```js
// 4. eslint.config.mjs — la guardia:
import { telemetryGuard } from "@b-health/telemetry/eslint";
export default [
  { files: ["src/**/*.ts"], languageOptions: { parser: tsParser } },
  ...telemetryGuard({
    telemetryFiles: ["src/instrument.ts", "src/app.ts"], // pueden tocar Sentry
    consoleFiles: ["src/index.ts"],                      // startup banner
  }),
];
```

```ts
// 5. tests — silenciar el Logger en las suites:
import { setupLoggerMock } from "@b-health/telemetry/testing";
beforeEach(() => setupLoggerMock());
```

Referencia de adopción completa: `oca` (PR b-health/oca#164-165). El contrato conceptual y sus porqués: `dev-wiki/wiki/patterns/telemetria_sentry.md` (repo interno).

## Releases

Automáticos en cada merge a master (`.github/workflows/release.yml`): tests → bump por conventional commits (`feat:`→minor, `!:`/`BREAKING CHANGE`→major, resto→patch) → **rebuild de `dist/`** → tag → GitHub Release. Master está protegido por ruleset: el check `test` es requerido para mergear; el bot de release pushea vía deploy key.

`dist/` va commiteado porque los consumidores instalan como **git dependency** y sus Docker builds usan `npm install --ignore-scripts` (`prepare` no corre). El workflow garantiza que el dist de cada tag corresponde a su source.

Para actualizar un consumidor: `npm install github:b-health/telemetry#vX.Y.Z` (reescribe package.json + lock con el SHA exacto — builds reproducibles). `npm update` no aplica a git-deps pineados: el bump es siempre explícito, nunca por arrastre.
