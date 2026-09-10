import { execFileSync } from "node:child_process";
import { parseRemote } from "../git/remote-parser.js";
import type { Finding } from "../types.js";

export async function verifyRemote(remote: string, expectedUser: string): Promise<Finding> {
  const parsed = parseRemote(remote);
  if (!remote.startsWith("git@")) {
    return verifyHttpsRemote(parsed.owner, parsed.repository, expectedUser);
  }
  try {
    const output = execFileSync("ssh", ["-o", "ConnectTimeout=5", "-T", `git@${parsed.host}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return authenticatedFinding(output, expectedUser);
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return authenticatedFinding(`${failure.stdout ?? ""}\n${failure.stderr ?? ""}`, expectedUser);
  }
}

function authenticatedFinding(output: string, expectedUser: string): Finding {
  const match = output.match(/Hi\s+([^!]+)!/i);
  return match && match[1].trim() === expectedUser
    ? { level: "PASS", title: "Remote authentication", detail: `authenticated as ${match[1].trim()}` }
    : match
      ? { level: "FAIL", title: "Remote authentication mismatch", detail: `expected ${expectedUser}, authenticated as ${match[1].trim()}` }
    : { level: "FAIL", title: "Remote authentication", detail: "SSH did not identify a GitHub account" };
}

async function verifyHttpsRemote(owner: string, repository: string, expectedUser: string): Promise<Finding> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? credentialHelperToken(owner, repository);
  if (!token) {
    return { level: "WARN", title: "Remote authentication", detail: "no GitHub credential available for HTTPS verification" };
  }
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "gitguard" },
    });
    if (!response.ok) return { level: "FAIL", title: "Remote authentication", detail: `GitHub API rejected the credential (HTTP ${response.status})` };
    const user = (await response.json() as { login?: string }).login;
    return user === expectedUser
      ? { level: "PASS", title: "Remote authentication", detail: `authenticated as ${user}` }
      : { level: "FAIL", title: "Remote authentication mismatch", detail: `expected ${expectedUser}, authenticated as ${user ?? "unknown"}` };
  } catch (error) {
    return { level: "WARN", title: "Remote authentication", detail: `GitHub API verification unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
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
