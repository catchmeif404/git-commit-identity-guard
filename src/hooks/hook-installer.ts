import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function installHooks(hooksDir: string, cliPath: string): void {
  mkdirSync(hooksDir, { recursive: true });
  for (const hook of ["pre-commit", "pre-push"]) {
    const path = join(hooksDir, hook);
    const backup = `${path}.gitguard-original`;
    if (existsSync(path) && !existsSync(backup) && !readFileSync(path, "utf8").includes("gitguard")) copyFileSync(path, backup);
    const phase = hook === "pre-commit" ? "commit" : "push";
    writeFileSync(path, `#!/bin/sh\nset -e\nif [ -f "${backup}" ]; then sh "${backup}" "$@"; fi\nnode "${cliPath}" check --phase ${phase}\n`, { mode: 0o755 });
    console.log(`Installed ${hook}`);
  }
}
