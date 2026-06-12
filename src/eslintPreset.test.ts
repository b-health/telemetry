// El preset es un export público ("./eslint") que hasta ahora se shippeaba sin
// validación alguna: ni tsc ni jest lo tocaban. Este test lo importa de verdad
// y corre fixtures contra Linter — un selector roto o un shape inválido falla acá.
import { Linter } from "eslint";
import { readFileSync } from "fs";
import { join } from "path";

// El .mjs no tiene imports: se carga transformando el source (jest CJS no
// puede importar ESM sin flags de VM). La carga ESM real la valida el smoke
// de CI (`node -e "import('./eslint/index.mjs')"`).
const loadPreset = () => {
  const source = readFileSync(join(__dirname, "../eslint/index.mjs"), "utf8")
    .replace("export const telemetryGuard", "const telemetryGuard")
    .replace(/^export default .*$/m, "");
  return new Function(`${source}; return { telemetryGuard };`)() as {
    telemetryGuard: (opts?: any) => any[];
  };
};

describe("telemetryGuard preset", () => {
  it("produces the expected config shape for defaults and full options", () => {
    const { telemetryGuard } = loadPreset();

    const base = telemetryGuard();
    expect(base).toHaveLength(1);
    expect(base[0].rules["no-console"]).toBe("warn");
    expect(base[0].rules["no-restricted-imports"][1].patterns[0].group).toContain("@sentry/*");

    const full = telemetryGuard({
      telemetryFiles: ["src/instrument.ts"],
      consoleFiles: ["src/index.ts"],
      severity: "error",
    });
    expect(full).toHaveLength(3);
    expect(full[0].rules["no-console"]).toBe("error");
    expect(full[1].files).toEqual(["src/instrument.ts"]);
    expect(full[1].rules["no-restricted-syntax"]).toBe("off");
    expect(full[2].rules["no-console"]).toBe("off");
  });

  it("the rules actually fire on violation fixtures", () => {
    const { telemetryGuard } = loadPreset();
    const [base] = telemetryGuard();
    const linter = new Linter();
    const config = {
      languageOptions: { ecmaVersion: 2022 as const, sourceType: "module" as const },
      rules: base.rules,
    };

    const consoleHit = linter.verify('console.log("x");', config);
    expect(consoleHit.some((m) => m.ruleId === "no-console")).toBe(true);

    const sentryHit = linter.verify('import * as S from "@sentry/node";', config);
    expect(sentryHit.some((m) => m.ruleId === "no-restricted-imports")).toBe(true);

    const criticalHit = linter.verify('Logger.log({ title: "x" }, "CRITICAL");', config);
    expect(criticalHit.some((m) => m.ruleId === "no-restricted-syntax")).toBe(true);

    const clean = linter.verify('Logger.report(new Error("x"));', config);
    expect(clean).toHaveLength(0);
  });
});
