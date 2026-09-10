import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { GitClient } from "../git/git-client.js";
import { parseRemote } from "../git/remote-parser.js";
import { readIdentityConfig, writeIdentityConfig } from "../config/identity-config.js";
import { IdentityChecker } from "../checks/identity-checker.js";
import { checkHistory } from "../checks/history-checker.js";
import { installHooks } from "../hooks/hook-installer.js";
import { readProfiles } from "../config/profile-store.js";
import { verifyRemote } from "../remote/remote-verifier.js";
import { printFindings, printResult } from "../output/reporter.js";
import type { IdentityConfig } from "../types.js";

export async function runCli(args: string[], cliPath: string): Promise<void> {
  const command = args[0] ?? "status";
  const json = args.includes("--json");
  const requestedPhase = args.includes("--phase") ? args[args.indexOf("--phase") + 1] : "all";
  if (command === "check" && requestedPhase !== "commit" && requestedPhase !== "push") {
    throw new Error("check requires --phase commit or --phase push");
  }
  const git = new GitClient();
  const repoRoot = git.repositoryRoot();
  const configPath = join(repoRoot, git.gitDirectory(), "gitidentity.yml");
  const profilesPath = join(homedir(), ".config", "gitguard", "profiles.yml");

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

  if (command === "profile") {
    const profiles = readProfiles(profilesPath);
    const action = args[1];
    if (action === "list") {
      for (const name of profiles.keys()) console.log(name);
      return;
    }
    if (action === "use") {
      const name = args[2];
      const profile = name ? profiles.get(name) : undefined;
      if (!profile) throw new Error(`profile not found: ${name ?? "missing"}`);
      const remote = git.origin();
      const parsed = parseRemote(remote);
      const nextConfig: IdentityConfig = {
        ...profile,
        remote,
        policies: { ...profile.policies },
      };
      git.setLocalConfig("user.name", profile.name);
      git.setLocalConfig("user.email", profile.email);
      const profileRemote = parsed.owner && profile.sshHostAlias
        ? `git@${profile.sshHostAlias}:${parsed.owner}/${parsed.repository}.git` : remote;
      nextConfig.remote = profileRemote;
      git.setOrigin(profileRemote);
      writeIdentityConfig(configPath, nextConfig);
      console.log(`Applied profile '${name}' to local Git config and origin`);
      return;
    }
    throw new Error("profile requires 'list' or 'use <name>'");
  }

  const config = readIdentityConfig(configPath);
  if (!config) throw new Error(`no config found; run 'gitguard init' first (${configPath})`);
  if (command === "check-history") {
    process.exitCode = printFindings(checkHistory(git, config, git.defaultBranch()), json);
    return;
  }

  if (command === "doctor") {
    const findings = new IdentityChecker(git).run(config, "all");
    const code = printFindings(findings, json);
    if (!json) {
      console.log(`\nConfig: ${configPath}`);
      console.log(`Remote policy: ${config.remote}`);
    }
    process.exitCode = code;
    return;
  }

  if (command === "verify-remote") {
    process.exitCode = printFindings([await verifyRemote(git.origin(), config.githubUser)], json);
    return;
  }

  if (command === "fix") {
    const apply = args.includes("--apply");
    const actualRemote = git.origin();
    console.log(`Planned local changes:`);
    console.log(`  user.name:  ${git.localConfig("user.name")} -> ${config.name}`);
    console.log(`  user.email: ${git.localConfig("user.email")} -> ${config.email}`);
    console.log(`  origin:     ${actualRemote} -> ${config.remote}`);
    if (!apply) {
      console.log("\nDry run. Re-run with --apply to modify local config and origin.");
      return;
    }
    git.setLocalConfig("user.name", config.name);
    git.setLocalConfig("user.email", config.email);
    git.setOrigin(config.remote);
    console.log("\nApplied local changes. Global config and remote history were not modified.");
    return;
  }

  const checkPhase = command === "check" ? requestedPhase as "commit" | "push" : "all";
  const phaseFindings = new IdentityChecker(git).run(config, checkPhase);
  if (command === "check" && checkPhase === "push") {
    phaseFindings.push(...checkHistory(git, config, git.defaultBranch()));
  }
  const code = printFindings(phaseFindings, json);
  if (command === "status") {
    if (!json) printResult(code);
  } else if (command === "check") {
    process.exitCode = code;
  } else {
    throw new Error(`unknown command: ${command}`);
  }
}
