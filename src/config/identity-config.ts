import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { IdentityConfig, Policy } from "../types.js";

export function readIdentityConfig(path: string): IdentityConfig | null {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const values: Record<string, string> = {};
  let section = "";
  for (const line of lines) {
    const sectionMatch = line.match(/^([a-zA-Z]+):\s*$/);
    if (sectionMatch) { section = sectionMatch[1]; continue; }
    const valueMatch = line.match(/^\s{2,}([a-zA-Z_]+):\s*["']?([^"']*)["']?\s*$/);
    if (valueMatch) values[`${section}.${valueMatch[1]}`] = valueMatch[2].trim();
  }
  const name = values["identity.name"];
  const email = values["identity.email"];
  const githubUser = values["identity.github_user"];
  const remote = values["repository.remote"];
  const sshHostAlias = values["auth.ssh_host_alias"];
  if (!name || !email || !githubUser || !remote || !sshHostAlias) {
    throw new Error(`invalid identity config: ${path}`);
  }
  const policy = (key: string, fallback: Policy): Policy => (values[key] as Policy | undefined) ?? fallback;
  return { name, email, githubUser, remote, sshHostAlias, policies: {
    wrong_author: policy("policy.wrong_author", "fail"),
    wrong_email: policy("policy.wrong_email", "fail"),
    wrong_remote_owner: policy("policy.wrong_remote_owner", "fail"),
    unexpected_ssh_identity: policy("policy.unexpected_ssh_identity", "warn"),
    history_mismatch: policy("policy.history_mismatch", "fail"),
  } };
}

export function writeIdentityConfig(path: string, config: IdentityConfig): void {
  const content = `version: 1\n\nidentity:\n  name: "${config.name}"\n  email: "${config.email}"\n  github_user: "${config.githubUser}"\n\nrepository:\n  owner: "${config.githubUser}"\n  remote: "${config.remote}"\n\nauth:\n  method: ssh\n  ssh_host_alias: "${config.sshHostAlias}"\n\npolicy:\n  wrong_author: fail\n  wrong_email: fail\n  wrong_remote_owner: fail\n  unexpected_ssh_identity: warn\n  history_mismatch: fail\n`;
  writeFileSync(path, content, { mode: 0o600 });
}
