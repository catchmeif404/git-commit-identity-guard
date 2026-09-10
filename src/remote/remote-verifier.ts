import { execFileSync } from "node:child_process";
import { parseRemote } from "../git/remote-parser.js";
import type { Finding } from "../types.js";

export function verifyRemote(remote: string): Finding {
  const parsed = parseRemote(remote);
  if (!remote.startsWith("git@")) {
    return { level: "WARN", title: "Remote authentication", detail: "HTTPS remote cannot identify the authenticated account locally" };
  }
  try {
    const output = execFileSync("ssh", ["-o", "ConnectTimeout=5", "-T", `git@${parsed.host}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return authenticatedFinding(output);
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return authenticatedFinding(`${failure.stdout ?? ""}\n${failure.stderr ?? ""}`);
  }
}

function authenticatedFinding(output: string): Finding {
  const match = output.match(/Hi\s+([^!]+)!/i);
  return match
    ? { level: "PASS", title: "Remote authentication", detail: `authenticated as ${match[1]}` }
    : { level: "FAIL", title: "Remote authentication", detail: "SSH did not identify a GitHub account" };
}
