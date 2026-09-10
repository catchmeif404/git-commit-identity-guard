#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

type Policy = "fail" | "warn" | "require-check";
type IdentityConfig = {
  name: string;
  email: string;
  githubUser: string;
  remote: string;
  sshHostAlias: string;
  policies: Record<string, Policy>;
};
type Finding = { level: "PASS" | "WARN" | "FAIL"; title: string; detail: string };

const args = process.argv.slice(2);
const command = args[0] ?? "status";
const phase = args.includes("--phase") ? args[args.indexOf("--phase") + 1] : "commit";
const repoRoot = git(["rev-parse", "--show-toplevel"]);
const gitDir = git(["rev-parse", "--git-dir"]);
const configPath = join(repoRoot, gitDir, "gitidentity.yml");

function git(arguments_: string[]): string {
  try {
    return execFileSync("git", arguments_, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`git command failed: ${message}`);
  }
}

function fail(message: string): never {
  console.error(`gitguard: ${message}`);
  process.exit(2);
}

function loadConfig(): IdentityConfig | null {
  if (!existsSync(configPath)) return null;
  const lines = readFileSync(configPath, "utf8").split(/\r?\n/);
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
    fail(`invalid identity config: ${configPath}`);
  }
  return { name, email, githubUser, remote, sshHostAlias, policies: {
    wrong_author: values["policy.wrong_author"] as Policy ?? "fail",
    wrong_email: values["policy.wrong_email"] as Policy ?? "fail",
    wrong_remote_owner: values["policy.wrong_remote_owner"] as Policy ?? "fail",
    unexpected_ssh_identity: values["policy.unexpected_ssh_identity"] as Policy ?? "warn",
    history_mismatch: values["policy.history_mismatch"] as Policy ?? "fail",
  } };
}

function parseRemote(remote: string): { owner: string; repository: string; host: string } {
  const scp = remote.match(/^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (scp) return { host: scp[1], owner: scp[2], repository: scp[3] };
  try {
    const url = new URL(remote);
    const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    return { host: url.hostname, owner: parts[0] ?? "", repository: parts[1] ?? "" };
  } catch { return { host: "", owner: "", repository: "" }; }
}

function sshIdentity(alias: string): string | null {
  const path = join(homedir(), ".ssh", "config");
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  let active = false;
  for (const line of lines) {
    const host = line.match(/^\s*Host\s+(.+)$/i);
    if (host) { active = host[1].split(/\s+/).includes(alias); continue; }
    if (active) {
      const identity = line.match(/^\s*IdentityFile\s+(.+)$/i);
      if (identity) return identity[1].replace(/^~/, homedir());
    }
  }
  return null;
}

function findings(config: IdentityConfig): Finding[] {
  const actualName = git(["config", "--local", "--get", "user.name"]);
  const actualEmail = git(["config", "--local", "--get", "user.email"]);
  const actualRemote = git(["remote", "get-url", "origin"]);
  const expectedRemote = parseRemote(config.remote);
  const actualRemoteParts = parseRemote(actualRemote);
  const result: Finding[] = [];
  result.push(actualName === config.name
    ? { level: "PASS", title: "Commit name", detail: actualName }
    : { level: "FAIL", title: "Commit name mismatch", detail: `expected ${config.name}, actual ${actualName || "missing"}` });
  result.push(actualEmail === config.email
    ? { level: "PASS", title: "Commit email", detail: actualEmail }
    : { level: "FAIL", title: "Commit email mismatch", detail: `expected ${config.email}, actual ${actualEmail || "missing"}` });
  result.push(actualRemoteParts.owner === expectedRemote.owner
    ? { level: "PASS", title: "Remote owner", detail: `${actualRemoteParts.owner}/${actualRemoteParts.repository}` }
    : { level: "FAIL", title: "Remote owner mismatch", detail: `expected ${expectedRemote.owner}, actual ${actualRemoteParts.owner || "unknown"}` });
  const key = sshIdentity(actualRemoteParts.host);
  result.push(actualRemoteParts.host === parseRemote(config.remote).host
    ? { level: "PASS", title: "SSH host alias", detail: actualRemoteParts.host }
    : { level: "WARN", title: "SSH host alias", detail: `expected ${parseRemote(config.remote).host}, actual ${actualRemoteParts.host || "unknown"}` });
  result.push(key
    ? { level: "PASS", title: "SSH identity file", detail: key }
    : { level: "WARN", title: "SSH identity file", detail: `no IdentityFile found for ${actualRemoteParts.host}` });
  return result;
}

function printFindings(items: Finding[]): number {
  for (const item of items) console.log(`${item.level.padEnd(4)}  ${item.title}\n      ${item.detail}`);
  return items.some(item => item.level === "FAIL") ? 1 : 0;
}

function init(): void {
  const remote = git(["remote", "get-url", "origin"]);
  const parsed = parseRemote(remote);
  const name = git(["config", "--local", "--get", "user.name"]);
  const email = git(["config", "--local", "--get", "user.email"]);
  if (!parsed.owner || !parsed.repository || !name || !email) fail("origin, local user.name, and local user.email are required");
  mkdirSync(dirname(configPath), { recursive: true });
  const content = `version: 1\n\nidentity:\n  name: "${name}"\n  email: "${email}"\n  github_user: "${parsed.owner}"\n\nrepository:\n  owner: "${parsed.owner}"\n  remote: "${remote}"\n\nauth:\n  method: ssh\n  ssh_host_alias: "${parsed.host}"\n\npolicy:\n  wrong_author: fail\n  wrong_email: fail\n  wrong_remote_owner: fail\n  unexpected_ssh_identity: warn\n  history_mismatch: fail\n`;
  writeFileSync(configPath, content, { mode: 0o600 });
  console.log(`Created ${configPath}`);
}

function checkHistory(config: IdentityConfig): number {
  const base = git(["merge-base", "HEAD", "main"]);
  const commits = git(["log", "--format=%H%x09%an%x09%ae", `${base}..HEAD`]);
  if (!commits) { console.log("No commits after main."); return 0; }
  const items = commits.split("\n").map(line => {
    const [sha, name, email] = line.split("\t");
    return { level: email === config.email && name === config.name ? "PASS" : "FAIL", title: sha.slice(0, 8), detail: `${name} <${email}>` } as Finding;
  });
  console.log(`${items.length} commits checked`);
  return printFindings(items);
}

function installHooks(): void {
  const hooksDir = join(repoRoot, ".git", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  for (const hook of ["pre-commit", "pre-push"]) {
    const path = join(hooksDir, hook);
    const backup = `${path}.gitguard-original`;
    if (existsSync(path) && !existsSync(backup)) copyFileSync(path, backup);
    const phase = hook === "pre-commit" ? "commit" : "push";
    writeFileSync(path, `#!/bin/sh\nset -e\nif [ -x "${backup}" ]; then "${backup}" "$@"; fi\nnode "${join(repoRoot, "dist/index.js")}" check --phase ${phase}\n`, { mode: 0o755 });
    console.log(`Installed ${hook}`);
  }
}

function main(): void {
  if (command === "init") { init(); return; }
  if (command === "install-hooks") { installHooks(); return; }
  const config = loadConfig();
  if (!config) fail(`no config found; run 'gitguard init' first (${configPath})`);
  if (command === "check-history") { process.exit(checkHistory(config)); }
  const result = printFindings(findings(config));
  if (command === "status") { console.log(`\nResult: ${result === 0 ? "SAFE" : "BLOCKED"}`); return; }
  if (command === "check") { process.exit(result); }
  fail(`unknown command: ${command}`);
}

main();
