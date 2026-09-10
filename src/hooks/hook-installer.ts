import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function installHooks(repoRoot: string, cliPath: string): void {
  const hooksDir = join(repoRoot, ".git", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  for (const hook of ["pre-commit", "pre-push"]) {
    const path = join(hooksDir, hook);
    const backup = `${path}.gitguard-original`;
    if (existsSync(path) && !existsSync(backup)) copyFileSync(path, backup);
    const phase = hook === "pre-commit" ? "commit" : "push";
    writeFileSync(path, `#!/bin/sh\nset -e\nif [ -x "${backup}" ]; then "${backup}" "$@"; fi\nnode "${cliPath}" check --phase ${phase}\n`, { mode: 0o755 });
    console.log(`Installed ${hook}`);
  }
}
