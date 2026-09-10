import { existsSync, readFileSync } from "node:fs";
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
      if (section.startsWith("wrong_") || section === "history_mismatch" || section === "unexpected_ssh_identity") {
        current.policies[section] = value as Policy;
      }
    }
  }
  if (current && name) profiles.set(name, current);
  return profiles;
}
