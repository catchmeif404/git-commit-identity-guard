import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseRemote } from "../dist/git/remote-parser.js";
import { readIdentityConfig } from "../dist/config/identity-config.js";
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
