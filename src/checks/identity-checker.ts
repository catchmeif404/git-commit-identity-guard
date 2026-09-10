import { identityFile } from "../ssh/ssh-config.js";
import { GitClient } from "../git/git-client.js";
import { parseRemote } from "../git/remote-parser.js";
import type { Finding, IdentityConfig } from "../types.js";

export class IdentityChecker {
  constructor(private readonly git: GitClient) {}

  run(config: IdentityConfig, phase: "commit" | "push" | "all" = "all"): Finding[] {
    const actualName = this.git.localConfig("user.name");
    const actualEmail = this.git.localConfig("user.email");
    const actualRemote = this.git.origin();
    const expectedRemote = parseRemote(config.remote);
    const actualRemoteParts = parseRemote(actualRemote);
    const result: Finding[] = [];

    result.push(actualName === config.name
      ? { level: "PASS", title: "Commit name", detail: actualName }
      : { level: policyLevel(config, "wrong_author"), title: "Commit name mismatch", detail: `expected ${config.name}, actual ${actualName || "missing"}` });
    result.push(actualEmail === config.email
      ? { level: "PASS", title: "Commit email", detail: actualEmail }
      : { level: policyLevel(config, "wrong_email"), title: "Commit email mismatch", detail: `expected ${config.email}, actual ${actualEmail || "missing"}` });
    if (phase === "commit") return result;
    result.push(actualRemoteParts.owner === expectedRemote.owner
      ? { level: "PASS", title: "Remote owner", detail: `${actualRemoteParts.owner}/${actualRemoteParts.repository}` }
      : { level: policyLevel(config, "wrong_remote_owner"), title: "Remote owner mismatch", detail: `expected ${expectedRemote.owner}, actual ${actualRemoteParts.owner || "unknown"}` });
    result.push(actualRemoteParts.host === expectedRemote.host
      ? { level: "PASS", title: "SSH host alias", detail: actualRemoteParts.host }
      : { level: "WARN", title: "SSH host alias", detail: `expected ${expectedRemote.host}, actual ${actualRemoteParts.host || "unknown"}` });
    const key = identityFile(actualRemoteParts.host);
    result.push(key
      ? { level: "PASS", title: "SSH identity file", detail: key }
      : { level: policyLevel(config, "unexpected_ssh_identity"), title: "SSH identity file", detail: `no IdentityFile found for ${actualRemoteParts.host}` });
    return result;
  }
}

function policyLevel(config: IdentityConfig, policyName: string): "WARN" | "FAIL" {
  return config.policies[policyName] === "warn" ? "WARN" : "FAIL";
}
