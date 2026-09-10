# gitguard design

`gitguard` prevents commits and pushes that use the wrong repository identity. The MVP is local
only: it reads Git config, the origin URL, and SSH config. It never stores credentials or rewrites
remote history.

## Current architecture

```text
CLI entrypoint
  └─ commands
      ├─ GitClient
      ├─ IdentityConfig
      ├─ IdentityChecker
      ├─ HistoryChecker
      ├─ SshConfig
      ├─ HookInstaller
      └─ Reporter
```

`src/index.ts` only starts `runCli`. Feature code belongs in the module that owns it so parsers and
checks can be tested without spawning the CLI.

## Phase 1: local guard (implemented)

- `init` creates `.git/gitidentity.yml` from the current local identity and origin.
- `status` reports local author, remote owner, SSH alias, and inferred IdentityFile.
- `check` returns exit code 1 for author/email/remote-owner violations.
- `check-history` inspects commits after the merge-base with `main`.
- `install-hooks` installs pre-commit and pre-push shims and preserves existing hooks.

## Phase 2: reliable policy engine

1. Parse command options into a typed `CliOptions` object. Unknown options must return exit code 2.
2. Make `--phase commit` and `--phase push` select different check sets. (Implemented in the
   current MVP; the parser remains intentionally small until more options are added.)
   - commit: local author and repository config
   - push: remote owner, SSH alias, history, and branch target
3. Apply the policy values in `.gitidentity.yml` to convert findings into PASS/WARN/FAIL.
   (Implemented for identity, remote, SSH, and history findings.)
4. Replace the hand-written YAML subset parser with a strict, dependency-light parser or a clearly
   documented supported subset with validation and line-numbered errors.
5. Add a `doctor` command that explains missing config, global/local overrides, missing SSH aliases,
   and unsupported remote formats. (Initial diagnostic output is implemented.)

## Phase 3: profiles and remote verification

- Store machine-local profiles in `~/.config/gitguard/profiles.yml`.
- `profile list` and `profile use <name>` only change repository-local Git config.
- `verify-remote` performs an explicit network check and labels its result VERIFIED; normal checks
  remain local and use INFERRED for SSH identity.
- `fix` may update local config or an SSH remote alias after showing a diff. It never changes global
  config, credentials, or already-pushed history.

## Phase 4: CI and agent integration

- Provide a stable JSON output mode for CI and coding agents.
- Add a GitHub Action that runs `gitguard check --phase push` on pull requests.
- Add an optional agent-facing preflight command that returns machine-readable reasons before an AI
  agent commits or pushes.

## Safety rules

- No credential files or token values are stored.
- No automatic force push, rebase, amend, or remote-history rewrite.
- Existing hooks are backed up before installation.
- Remote verification is opt-in because it performs network I/O.
