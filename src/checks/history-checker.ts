import { GitClient } from "../git/git-client.js";
import type { Finding, IdentityConfig } from "../types.js";

export function checkHistory(git: GitClient, config: IdentityConfig): Finding[] {
  const base = git.run(["merge-base", "HEAD", "main"]);
  const commits = git.run(["log", "--format=%H%x09%an%x09%ae", `${base}..HEAD`]);
  if (!commits) return [];
  return commits.split("\n").map((line) => {
    const [sha, name, email] = line.split("\t");
    const matches = email === config.email && name === config.name;
    return matches
      ? { level: "PASS", title: sha.slice(0, 8), detail: `${name} <${email}>` }
      : { level: config.policies.history_mismatch === "warn" ? "WARN" : "FAIL", title: sha.slice(0, 8), detail: `${name} <${email}>` };
  });
}
