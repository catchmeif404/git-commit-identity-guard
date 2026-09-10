import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { GitClient } from "../git/git-client.js";
import { parseRemote } from "../git/remote-parser.js";
import { readIdentityConfig, writeIdentityConfig } from "../config/identity-config.js";
import { IdentityChecker } from "../checks/identity-checker.js";
import { checkHistory } from "../checks/history-checker.js";
import { installHooks } from "../hooks/hook-installer.js";
import { printFindings, printResult } from "../output/reporter.js";
import type { IdentityConfig } from "../types.js";

export async function runCli(args: string[], cliPath: string): Promise<void> {
  const command = args[0] ?? "status";
  const requestedPhase = args.includes("--phase") ? args[args.indexOf("--phase") + 1] : "all";
  if (command === "check" && requestedPhase !== "commit" && requestedPhase !== "push") {
    throw new Error("check requires --phase commit or --phase push");
  }
  const git = new GitClient();
  const repoRoot = git.repositoryRoot();
  const configPath = join(repoRoot, git.gitDirectory(), "gitidentity.yml");

  if (command === "init") {
    const remote = git.origin();
    const parsed = parseRemote(remote);
    const name = git.localConfig("user.name");
    const email = git.localConfig("user.email");
    if (!parsed.owner || !parsed.repository || !name || !email) {
      throw new Error("origin, local user.name, and local user.email are required");
    }
    const config: IdentityConfig = {
      name,
      email,
      githubUser: parsed.owner,
      remote,
      sshHostAlias: parsed.host,
      policies: {
        wrong_author: "fail",
        wrong_email: "fail",
        wrong_remote_owner: "fail",
        unexpected_ssh_identity: "warn",
        history_mismatch: "fail",
      },
    };
    mkdirSync(dirname(configPath), { recursive: true });
    writeIdentityConfig(configPath, config);
    console.log(`Created ${configPath}`);
    return;
  }

  if (command === "install-hooks") {
    installHooks(repoRoot, cliPath);
    return;
  }

  const config = readIdentityConfig(configPath);
  if (!config) throw new Error(`no config found; run 'gitguard init' first (${configPath})`);
  if (command === "check-history") {
    process.exitCode = printFindings(checkHistory(git, config));
    return;
  }

  if (command === "doctor") {
    const findings = new IdentityChecker(git).run(config, "all");
    const code = printFindings(findings);
    console.log(`\nConfig: ${configPath}`);
    console.log(`Remote policy: ${config.remote}`);
    process.exitCode = code;
    return;
  }

  const code = printFindings(new IdentityChecker(git).run(config, command === "check" ? requestedPhase as "commit" | "push" : "all"));
  if (command === "status") printResult(code);
  else if (command === "check") process.exitCode = code;
  else throw new Error(`unknown command: ${command}`);
}
