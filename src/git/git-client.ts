import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export class GitClient {
  constructor(private readonly cwd: string = process.cwd()) {}

  run(arguments_: string[]): string {
    try {
      return execFileSync("git", arguments_, {
        cwd: this.cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`git command failed: ${message}`);
    }
  }

  optional(arguments_: string[]): string {
    try {
      return execFileSync("git", arguments_, {
        cwd: this.cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    } catch {
      return "";
    }
  }

  repositoryRoot(): string {
    return this.run(["rev-parse", "--show-toplevel"]);
  }

  gitDirectory(): string {
    return this.run(["rev-parse", "--git-dir"]);
  }

  localConfig(key: string): string {
    return this.optional(["config", "--local", "--get", key]);
  }

  origin(): string {
    return this.run(["remote", "get-url", "origin"]);
  }

  setLocalConfig(key: string, value: string): void {
    this.run(["config", "--local", key, value]);
  }

  setOrigin(remote: string): void {
    this.run(["remote", "set-url", "origin", remote]);
  }

  currentBranch(): string {
    return this.optional(["branch", "--show-current"]);
  }

  hooksDirectory(): string {
    return resolve(this.cwd, this.run(["rev-parse", "--git-path", "hooks"]));
  }

  defaultBranch(): string {
    const symbolic = this.optional(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
    if (symbolic.startsWith("origin/")) return symbolic.slice("origin/".length);
    const remoteInfo = this.optional(["remote", "show", "-n", "origin"]);
    const advertised = remoteInfo.match(/HEAD branch:\s*(\S+)/i)?.[1];
    if (advertised && !advertised.startsWith("(")) return advertised;
    for (const candidate of ["main", "master"]) {
      if (this.optional(["rev-parse", "--verify", candidate])) return candidate;
    }
    throw new Error("could not detect the default branch; set origin/HEAD or use main/master");
  }
}
