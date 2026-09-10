import { GitClient } from "../git/git-client.js";
import type { Finding, IdentityConfig } from "../types.js";

export function checkBranch(git: GitClient, config: IdentityConfig): Finding {
  const current = git.currentBranch();
  const defaultBranch = git.defaultBranch();
  if (!current) {
    return { level: "FAIL", title: "Detached HEAD", detail: `default branch is ${defaultBranch}` };
  }
  if (current === defaultBranch) {
    return {
      level: config.policies.direct_default_branch === "fail" ? "FAIL" : "WARN",
      title: "Direct push to default branch",
      detail: `${current} is the repository default branch`,
    };
  }
  return { level: "PASS", title: "Working branch", detail: `${current} (default: ${defaultBranch})` };
}
