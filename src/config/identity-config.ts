import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { IdentityConfig, Policy } from "../types.js";

export function readIdentityConfig(path: string): IdentityConfig | null {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const values: Record<string, string> = {};
  let section = "";
  const sections = new Set(["version", "identity", "repository", "auth", "policy"]);
  const keys = new Set([
    "identity.name", "identity.email", "identity.github_user", "repository.owner",
    "repository.remote", "auth.method", "auth.ssh_host_alias", "policy.wrong_author",
    "policy.wrong_email", "policy.wrong_remote_owner", "policy.unexpected_ssh_identity",
    "policy.history_mismatch",
  ]);
  for (const [index, line] of lines.entries()) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^version:\s*1\s*$/.test(line)) continue;
    const sectionMatch = line.match(/^([a-zA-Z]+):\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      if (!sections.has(section)) throw new Error(`invalid section at ${path}:${index + 1}: ${section}`);
      continue;
    }
    const valueMatch = line.match(/^\s{2,}([a-zA-Z_]+):\s*["']?([^"']*)["']?\s*$/);
    if (!valueMatch) throw new Error(`invalid config line at ${path}:${index + 1}`);
    const key = `${section}.${valueMatch[1]}`;
    if (!keys.has(key)) throw new Error(`unknown config key at ${path}:${index + 1}: ${key}`);
    values[key] = valueMatch[2].trim();
  }
  const name = values["identity.name"];
  const email = values["identity.email"];
  const githubUser = values["identity.github_user"];
  const remote = values["repository.remote"];
  const sshHostAlias = values["auth.ssh_host_alias"];
  if (!name || !email || !githubUser || !remote || !sshHostAlias) {
    throw new Error(`invalid identity config: ${path}`);
  }
  const policy = (key: string, fallback: Policy): Policy => {
    const value = values[key] as Policy | undefined;
    if (value && !["fail", "warn", "require-check"].includes(value)) {
      throw new Error(`invalid policy at ${path}: ${key}=${value}`);
    }
    return value ?? fallback;
  };
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
