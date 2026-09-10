import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { dirname, join } from "node:path";
import { GitClient } from "../git/git-client.js";
import { parseRemote } from "../git/remote-parser.js";
import { readIdentityConfig, writeIdentityConfig } from "../config/identity-config.js";
import { IdentityChecker } from "../checks/identity-checker.js";
import { checkHistory } from "../checks/history-checker.js";
import { checkBranch } from "../checks/branch-checker.js";
import { installHooks } from "../hooks/hook-installer.js";
import { readProfiles, writeProfiles, type Profile } from "../config/profile-store.js";
import { detectRemoteUser, verifyRemote } from "../remote/remote-verifier.js";
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

  if (command === "setup") {
    const profiles = readProfiles(profilesPath);
    if (profiles.size === 0) {
      profiles.set("personal", await profileFromArgs("personal", args.slice(1), detectedProfileDefaults(git), true));
      writeProfiles(profilesPath, profiles);
      console.log(`Created the 'personal' profile`);
    }
    const profileName = args[1] ?? await selectProfile(profiles);
    await applyProfile(profileName, profiles, git, configPath);
    return;
  }

  if (command === "init") {
    if (existsSync(configPath) && !args.includes("--force")) {
      throw new Error(`config already exists; use 'init --force' to replace it (${configPath})`);
    }
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
        direct_default_branch: "warn",
      },
    };
    mkdirSync(dirname(configPath), { recursive: true });
    writeIdentityConfig(configPath, config);
    console.log(`Created ${configPath}`);
    return;
  }

  if (command === "install-hooks") {
    installHooks(git.hooksDirectory(), cliPath);
    return;
  }

  if (command === "profile") {
    const profiles = readProfiles(profilesPath);
    const action = args[1];
    if (!action) {
      if (profiles.size === 0) {
        profiles.set("personal", await profileFromArgs("personal", [], detectedProfileDefaults(git), true));
        writeProfiles(profilesPath, profiles);
      }
      await applyProfile(await selectProfile(profiles), profiles, git, configPath);
      return;
    }
    if (action === "init") {
      const name = args[2] ?? "personal";
      if (profiles.has(name) && !args.includes("--force")) {
        throw new Error(`profile already exists: ${name}; use --force to replace it`);
      }
      profiles.set(name, await profileFromArgs(name, args.slice(3), detectedProfileDefaults(git), true));
      writeProfiles(profilesPath, profiles);
      console.log(`Saved profile '${name}' to ${profilesPath}`);
      return;
    }
    if (action === "add") {
      const hasName = args[2] && !args[2].startsWith("--");
      const name = hasName ? args[2] : await profileNamePrompt();
      if (profiles.has(name) && !args.includes("--force")) {
        throw new Error(`profile already exists: ${name}; use --force to replace it`);
      }
      const defaults = detectedProfileDefaults(git);
      const detectedUser = await detectRemoteUser(git.origin());
      const githubUser = args.includes("--github-user") ? undefined
        : await selectGitHubAccount(detectedUser ?? defaults.githubUser);
      const profile = await profileFromArgs(name, args.slice(hasName ? 3 : 2), {
        ...defaults,
        githubUser: githubUser ?? detectedUser ?? defaults.githubUser,
      }, true);
      profiles.set(name, profile);
      writeProfiles(profilesPath, profiles);
      console.log(`Saved profile '${name}' to ${profilesPath}`);
      return;
    }
    if (action === "list") {
      for (const name of profiles.keys()) console.log(name);
      return;
    }
    if (action === "show") {
      const name = args[2];
      const profile = name ? profiles.get(name) : undefined;
      if (!profile) throw new Error(`profile not found: ${name ?? "missing"}`);
      console.log(JSON.stringify({ profileName: name, ...profile, policies: profile.policies }, null, 2));
      return;
    }
    if (action === "remove") {
      const name = args[2];
      if (!name || !profiles.has(name)) throw new Error(`profile not found: ${name ?? "missing"}`);
      if (!args.includes("--force")) throw new Error("profile remove requires --force");
      profiles.delete(name);
      writeProfiles(profilesPath, profiles);
      console.log(`Removed profile '${name}'`);
      return;
    }
    if (action === "use") {
      const name = args[2] ?? await selectProfile(profiles);
      await applyProfile(name, profiles, git, configPath);
      return;
    }
    throw new Error("profile requires list, show <name>, add <name>, use <name>, or remove <name> --force");
  }

  const config = readIdentityConfig(configPath);
  if (!config) throw new Error(`no config found; run 'gitguard init' first (${configPath})`);
  if (command === "check-history") {
    process.exitCode = printFindings(checkHistory(git, config, git.defaultBranch()), json);
    return;
  }

  if (command === "doctor") {
    const findings = new IdentityChecker(git).run(config, "all");
    findings.push(checkBranch(git, config));
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
    phaseFindings.push(checkBranch(git, config));
    const remoteFinding = await verifyRemote(git.origin(), config.githubUser);
    phaseFindings.push(config.policies.remote_authentication === "warn" && remoteFinding.level === "FAIL"
      ? { ...remoteFinding, level: "WARN" }
      : remoteFinding);
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

async function selectProfile(profiles: Map<string, Profile>): Promise<string> {
  const names = [...profiles.keys()];
  if (names.length === 1) return names[0];
  if (!input.isTTY) throw new Error("multiple profiles found; specify one by name");
  const prompts = createInterface({ input, output });
  try {
    console.log("Select identity profile:");
    names.forEach((name, index) => console.log(`  ${index + 1}. ${name}`));
    const answer = Number((await prompts.question("Profile number: ")).trim());
    const selected = names[answer - 1];
    if (!selected) throw new Error("invalid profile selection");
    return selected;
  } finally {
    prompts.close();
  }
}

async function profileNamePrompt(): Promise<string> {
  if (!input.isTTY) throw new Error("profile add requires a name outside an interactive terminal");
  const prompts = createInterface({ input, output });
  try {
    const name = (await prompts.question("Profile name [personal]: ")).trim();
    return name || "personal";
  } finally {
    prompts.close();
  }
}

async function selectGitHubAccount(defaultUser: string | undefined): Promise<string | undefined> {
  const accounts = ghAccounts();
  if (accounts.length === 0 || !input.isTTY) return defaultUser;
  const defaultIndex = Math.max(0, accounts.findIndex((account) => account === defaultUser));
  const prompts = createInterface({ input, output });
  try {
    console.log("GitHub account:");
    accounts.forEach((account, index) => console.log(`  ${index + 1}. ${account}${index === defaultIndex ? " (active)" : ""}`));
    const answer = (await prompts.question(`Account number [${defaultIndex + 1}]: `)).trim();
    const selected = answer ? accounts[Number(answer) - 1] : accounts[defaultIndex];
    if (!selected) throw new Error("invalid GitHub account selection");
    return selected;
  } finally {
    prompts.close();
  }
}

function ghAccounts(): string[] {
  try {
    const result = spawnSync("gh", ["auth", "status", "--hostname", "github.com"], {
      encoding: "utf8",
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    return [...output.matchAll(/account\s+([^\s(]+)/gi)].map((match) => match[1]);
  } catch {
    return [];
  }
}

async function applyProfile(name: string, profiles: Map<string, Profile>, git: GitClient, configPath: string): Promise<void> {
  const profile = profiles.get(name);
  if (!profile) throw new Error(`profile not found: ${name}`);
  const remote = git.origin();
  const parsed = parseRemote(remote);
  const nextConfig: IdentityConfig = { ...profile, remote, policies: { ...profile.policies } };
  git.setLocalConfig("user.name", profile.name);
  git.setLocalConfig("user.email", profile.email);
  const profileRemote = remote.startsWith("git@") && parsed.owner && profile.sshHostAlias
    ? `git@${profile.sshHostAlias}:${parsed.owner}/${parsed.repository}.git` : remote;
  nextConfig.remote = profileRemote;
  git.setOrigin(profileRemote);
  writeIdentityConfig(configPath, nextConfig);
  console.log(`Active profile: ${name}`);
  console.log(`Commit as: ${profile.name} <${profile.email}>`);
}

function detectedProfileDefaults(git: GitClient): Partial<Profile> {
  const remote = git.origin();
  const parsed = parseRemote(remote);
  return {
    name: git.localConfig("user.name"),
    email: git.localConfig("user.email"),
    githubUser: parsed.owner,
    sshHostAlias: parsed.host,
  };
}

async function profileFromArgs(name: string, args: string[], defaults: Partial<Profile> = {}, confirmDefaults = false): Promise<Profile> {
  const value = (option: string): string | undefined => {
    const index = args.indexOf(option);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const values = {
    name: value("--name") ?? defaults.name,
    email: value("--email") ?? defaults.email,
    githubUser: value("--github-user") ?? defaults.githubUser,
    sshHostAlias: value("--ssh-host-alias") ?? defaults.sshHostAlias,
  };
  if (Object.values(values).some((item) => !item) && !input.isTTY) {
    throw new Error("profile add needs --name, --email, --github-user, and --ssh-host-alias outside an interactive terminal");
  }
  const prompts = input.isTTY ? createInterface({ input, output }) : null;
  try {
    const ask = async (label: string, existing: string | undefined): Promise<string> => {
      if (existing && (!confirmDefaults || !input.isTTY)) return existing;
      const answer = (await prompts!.question(`${label}${existing ? ` [${existing}]` : ""}: `)).trim();
      return answer || existing || (() => { throw new Error(`${label} is required`); })();
    };
    return {
      name: await ask("Name", values.name),
      email: await ask("Email", values.email),
      githubUser: await ask("GitHub user", values.githubUser),
      sshHostAlias: await ask("SSH host alias", values.sshHostAlias),
      policies: {},
    };
  } finally {
    prompts?.close();
  }
}
