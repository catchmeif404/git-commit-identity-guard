import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Policy } from "../types.js";

export type Profile = {
  name: string;
  email: string;
  githubUser: string;
  sshHostAlias: string;
  policies: Record<string, Policy>;
};

export function readProfiles(path: string): Map<string, Profile> {
  const profiles = new Map<string, Profile>();
  if (!existsSync(path)) return profiles;
  let current: Profile | null = null;
  let name = "";
  let section = "";
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const profile = line.match(/^\s{2}([a-zA-Z0-9_-]+):\s*$/);
    if (profile) {
      if (current && name) profiles.set(name, current);
      name = profile[1];
      current = { name: "", email: "", githubUser: "", sshHostAlias: "", policies: {} };
      section = "";
      continue;
    }
    const nested = line.match(/^\s{4}([a-zA-Z_]+):\s*["']?([^"']*)["']?\s*$/);
    if (nested && current) {
      section = nested[1];
      const value = nested[2].trim();
      if (section === "name") current.name = value;
      if (section === "email") current.email = value;
      if (section === "github_user") current.githubUser = value;
      if (section === "ssh_host_alias") current.sshHostAlias = value;
      if (section.startsWith("wrong_") || section === "history_mismatch" || section === "unexpected_ssh_identity" || section === "direct_default_branch") {
        current.policies[section] = value as Policy;
      }
    }
  }
  if (current && name) profiles.set(name, current);
  return profiles;
}

export function writeProfiles(path: string, profiles: Map<string, Profile>): void {
  const lines = ["version: 1", "", "profiles:"];
  for (const [profileName, profile] of profiles) {
    lines.push(`  ${profileName}:`);
    lines.push(`    name: "${profile.name}"`);
    lines.push(`    email: "${profile.email}"`);
    lines.push(`    github_user: "${profile.githubUser}"`);
    lines.push(`    ssh_host_alias: "${profile.sshHostAlias}"`);
    lines.push("    wrong_author: fail");
    lines.push("    wrong_email: fail");
    lines.push("    wrong_remote_owner: fail");
    lines.push("    unexpected_ssh_identity: warn");
    lines.push("    history_mismatch: fail");
    lines.push("    direct_default_branch: warn");
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lines.join("\n")}\n`, { mode: 0o600 });
}
