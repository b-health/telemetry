// Guardia de arquitectura de telemetría — las 3 reglas del contrato, sin estilo.
// Uso en el eslint.config.mjs del consumidor:
//
//   import { telemetryGuard } from "@b-health/telemetry/eslint";
//   export default [
//     ...telemetryGuard({
//       files: ["src/**/*.ts"],
//       ignores: ["src/**/*.test.ts"],
//       telemetryFiles: ["src/instrument.ts", "src/app.ts", ...],  // pueden usar Sentry/CRITICAL
//       consoleFiles: ["src/index.ts"],                            // pueden usar console
//       severity: "warn" | "error",
//     }),
//   ];
//
// El parser TS lo aporta el consumidor en su propio bloque de config.

const LOGGER_CRITICAL_SELECTOR =
  "CallExpression[callee.object.name='Logger'][callee.property.name=/^(log|terminalLogger)$/] > Literal[value=/^(CRITICAL|IMPORTANT)$/]";

export const telemetryGuard = ({
  files = ["src/**/*.ts"],
  ignores = [],
  telemetryFiles = [],
  consoleFiles = [],
  severity = "warn",
} = {}) => [
  {
    files,
    ignores,
    rules: {
      "no-console": severity,
      "no-restricted-imports": [
        severity,
        {
          patterns: [
            {
              group: ["@sentry/*"],
              message:
                "Sentry directo solo en la capa de telemetría. Para reportar errores usá Logger.report() / Logger.reportPipeline() o fireAndForget().",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        severity,
        {
          selector: LOGGER_CRITICAL_SELECTOR,
          message:
            "CRITICAL/IMPORTANT los decide la política, no el call site: usá Logger.report(error, ctx) para errores manejados, Logger.info/debug para lo demás.",
        },
      ],
    },
  },
  ...(telemetryFiles.length
    ? [
        {
          files: telemetryFiles,
          rules: {
            "no-restricted-imports": "off",
            "no-restricted-syntax": "off",
          },
        },
      ]
    : []),
  ...(consoleFiles.length
    ? [
        {
          files: consoleFiles,
          rules: {
            "no-console": "off",
          },
        },
      ]
    : []),
];

export default telemetryGuard;
