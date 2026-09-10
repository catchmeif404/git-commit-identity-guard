import { execFileSync } from "node:child_process";
import { parseRemote } from "../git/remote-parser.js";
import type { Finding } from "../types.js";

export async function verifyRemote(remote: string, expectedUser: string): Promise<Finding> {
  const user = await detectRemoteUser(remote);
  return user
    ? user === expectedUser
      ? { level: "PASS", title: "Remote authentication", detail: `authenticated as ${user}` }
      : { level: "FAIL", title: "Remote authentication mismatch", detail: `expected ${expectedUser}, authenticated as ${user}` }
    : { level: "WARN", title: "Remote authentication", detail: "could not identify a GitHub account" };
}

export async function detectRemoteUser(remote: string): Promise<string | null> {
  const parsed = parseRemote(remote);
  if (remote.startsWith("git@")) return detectSshUser(parsed.host);
  return detectHttpsUser(parsed.owner, parsed.repository);
}

function detectSshUser(host: string): string | null {
  try {
    return parseSshUser(execFileSync("ssh", ["-o", "ConnectTimeout=5", "-T", `git@${host}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return parseSshUser(`${failure.stdout ?? ""}\n${failure.stderr ?? ""}`);
  }
}

function parseSshUser(output: string): string | null {
  const match = output.match(/Hi\s+([^!]+)!/i);
  return match?.[1].trim() ?? null;
}

async function detectHttpsUser(owner: string, repository: string): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? credentialHelperToken(owner, repository);
  if (!token) return null;
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "gitguard" },
    });
    if (!response.ok) return null;
    const user = (await response.json() as { login?: string }).login;
    return user ?? null;
  } catch { return null; }
}

function credentialHelperToken(owner: string, repository: string): string | undefined {
  try {
    const output = execFileSync("git", ["credential", "fill"], {
      input: `protocol=https\nhost=github.com\npath=${owner}/${repository}\n\n`,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return output.match(/^password=(.+)$/m)?.[1];
  } catch {
    return undefined;
  }
}
