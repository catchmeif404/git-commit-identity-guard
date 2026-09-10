import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function identityFile(alias: string): string | null {
  const path = join(homedir(), ".ssh", "config");
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  let active = false;
  for (const line of lines) {
    const host = line.match(/^\s*Host\s+(.+)$/i);
    if (host) {
      active = host[1].split(/\s+/).includes(alias);
      continue;
    }
    if (active) {
      const identity = line.match(/^\s*IdentityFile\s+(.+)$/i);
      if (identity) return identity[1].replace(/^~/, homedir());
    }
  }
  return null;
}
