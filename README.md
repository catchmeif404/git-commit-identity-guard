# gitguard

[한국어 README](README.ko.md)

Repository-aware Git identity guard for machines that use multiple GitHub accounts.

gitguard checks repository-local commit identity, GitHub remote ownership, branch history, SSH configuration, and the account used for remote verification. It is local-first: credentials are never stored, global Git configuration is never changed, and published history is never rewritten.

## Install

The package is not published to npm yet.

```bash
git clone https://github.com/catchmeif404/git-commit-identity-guard.git
cd git-commit-identity-guard
npm install
npm run build
npm link
```

## Quick start

Run these commands inside the repository you want to protect:

```bash
gitguard init
gitguard status
gitguard install-hooks
```

This creates `.git/gitidentity.yml`, a local-only repository policy. Existing policies are protected; use `gitguard init --force` to regenerate one intentionally.

Git hooks then enforce the checks:

```text
git commit -> pre-commit -> gitguard check --phase commit
git push   -> pre-push   -> gitguard check --phase push
```

A blocking finding returns exit code `1`.

## Commands

```bash
gitguard status
gitguard check --phase commit
gitguard check --phase push
gitguard check-history
gitguard doctor
gitguard verify-remote
gitguard fix
gitguard fix --apply
```

The commit phase checks `user.name` and `user.email`. The push phase also checks the remote owner, SSH configuration, detected current/default branch, and branch history. Direct pushes to the default branch produce a warning by default.

`check-history` uses the detected default branch. Detection checks `origin/HEAD`, local remote metadata, then `main` and `master`.

`verify-remote` performs an explicit authentication check. SSH remotes use `ssh -T`. HTTPS remotes use `GITHUB_TOKEN`, `GH_TOKEN`, or the Git credential helper and then verify the account through GitHub's `/user` API. The credential is used in memory only. When the authenticated account differs from `github_user`, verification fails; configure the intended SSH alias or HTTPS credential before pushing.

`fix` is a dry run. `fix --apply` changes only repository-local Git config and `origin`.

## Profiles

Profiles are machine-local at `~/.config/gitguard/profiles.yml`.

```bash
gitguard profile init personal
gitguard profile add company
gitguard profile add company --name "Company" --email "developer@company.example" --github-user company-user --ssh-host-alias github-company
gitguard profile list
gitguard profile show personal
gitguard profile
gitguard profile use personal
gitguard profile remove company --force
```

`profile use` updates the current repository's local name, email, and SSH remote alias. It never changes global Git config.

## Policy

The generated policy uses:

```yaml
policy:
  wrong_author: fail
  wrong_email: fail
  wrong_remote_owner: fail
  unexpected_ssh_identity: warn
  history_mismatch: fail
  direct_default_branch: warn
  remote_authentication: fail
```

Supported levels are `fail`, `warn`, and `require-check`. The push phase verifies the actual
GitHub authentication account against `github_user`; `remote_authentication` controls this
finding. Warnings do not block; other levels block.

## JSON output

Use `--json` for CI scripts and coding agents:

```bash
gitguard check --phase push --json
```

The output has a stable shape:

```json
{
  "result": "SAFE",
  "findings": [
    {
      "level": "PASS",
      "title": "Commit email",
      "detail": "developer@example.com"
    }
  ]
}
```

## Development

```bash
npm install
npm run build
npm test
```

Source responsibilities:

```text
src/index.ts                  CLI entrypoint
src/cli/commands.ts           command dispatch
src/git/                      Git commands, remotes, branch detection
src/config/                   repository and machine-local profile config
src/checks/                   identity, branch, and history checks
src/ssh/                      SSH config inspection
src/hooks/                    Git hook installation
src/output/                   terminal and JSON reporters
```

See [docs/DESIGN.md](docs/DESIGN.md) for architecture and the roadmap.

## Limitations

- The YAML reader supports the documented gitguard shape, not arbitrary YAML.
- HTTPS verification depends on an available GitHub credential.
- SSH verification is opt-in through `verify-remote`.
- No external GitHub history is rewritten automatically.

## License

License terms have not been selected yet.
