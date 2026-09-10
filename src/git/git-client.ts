import { execFileSync } from "node:child_process";

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
}
