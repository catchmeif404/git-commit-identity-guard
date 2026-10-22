import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { GitClient } from "../dist/git/git-client.js";
import { parseRemote } from "../dist/git/remote-parser.js";
import { identityConfigPath, readIdentityConfig } from "../dist/config/identity-config.js";
import { readProfiles } from "../dist/config/profile-store.js";

test("parses SSH and HTTPS GitHub remotes", () => {
  assert.deepEqual(parseRemote("git@github-personal:catchmeif404/devdna.git"), {
    host: "github-personal", owner: "catchmeif404", repository: "devdna",
  });
  assert.deepEqual(parseRemote("https://github.com/catchmeif404/devdna.git"), {
    host: "github.com", owner: "catchmeif404", repository: "devdna",
  });
});

test("rejects unknown identity config keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gitguard-config-"));
  const path = join(directory, "gitidentity.yml");
  await writeFile(path, "version: 1\nidentity:\n  name: test\n  email: test@example.com\n  github_user: test\n  unexpected: value\n");
  assert.throws(() => readIdentityConfig(path), /unknown config key/);
  await rm(directory, { recursive: true, force: true });
});

test("reads machine-local profiles", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gitguard-profiles-"));
  const path = join(directory, "profiles.yml");
  await writeFile(path, "version: 1\n\nprofiles:\n  personal:\n    name: test\n    email: test@example.com\n    github_user: test-user\n    ssh_host_alias: github-personal\n");
  const profiles = readProfiles(path);
  assert.equal(profiles.get("personal")?.githubUser, "test-user");
  await rm(directory, { recursive: true, force: true });
});

test("resolves the shared identity config from a linked worktree and a subdirectory", async () => {
  const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
  const root = realpathSync(await mkdtemp(join(tmpdir(), "gitguard-worktree-")));
  const main = join(root, "main");
  const worktree = join(root, "linked");
  const subdirectory = join(main, "nested", "dir");
  // Isolate from the developer's global/system git config.
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const gitguard = (cwd, ...args) => spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: "utf8" });
  try {
    mkdirSync(main);
    git(main, "init", "--initial-branch", "main");
    git(main, "config", "--local", "user.name", "test");
    git(main, "config", "--local", "user.email", "test@example.com");
    git(main, "remote", "add", "origin", "git@github-test:test-owner/test-repo.git");
    git(main, "commit", "--allow-empty", "--message", "init");
    git(main, "worktree", "add", "--quiet", "-b", "feature", worktree);
    mkdirSync(subdirectory, { recursive: true });

    const created = gitguard(main, "init");
    assert.equal(created.status, 0, created.stderr);
    const expectedPath = join(main, ".git", "gitidentity.yml");
    assert.ok(existsSync(expectedPath));

    for (const cwd of [worktree, subdirectory]) {
      assert.equal(identityConfigPath(new GitClient(cwd).commonGitDirectory()), expectedPath);
      const checked = gitguard(cwd, "check", "--phase", "commit");
      assert.equal(checked.status, 0, `${cwd}: ${checked.stdout}${checked.stderr}`);
      assert.doesNotMatch(checked.stderr, /no config found/);
      const reinit = gitguard(cwd, "init");
      assert.equal(reinit.status, 2);
      assert.ok(reinit.stderr.includes(`config already exists; use 'init --force' to replace it (${expectedPath})`), reinit.stderr);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
