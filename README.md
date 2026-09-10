# gitguard

Repository-aware Git identity guard for machines that use multiple GitHub accounts.

It checks local commit identity, the `origin` owner, SSH host aliases, and branch history before
commit or push. It stores repository policy in `.git/gitidentity.yml` and never stores credentials.

The implementation is split by responsibility under `src/`: `cli`, `commands`, `git`, `config`,
`checks`, `ssh`, `hooks`, and `output`. See [`docs/DESIGN.md`](docs/DESIGN.md) for the phase plan.

```bash
npm install
npm run build
node dist/index.js init
node dist/index.js status
node dist/index.js install-hooks
```

The hooks block mismatched commit authors and remote owners. Existing hooks are preserved as
`.gitguard-original`. Use `check --phase commit` for author checks and `check --phase push` for
author, remote, and SSH checks. `check-history` checks commits after the merge-base with `main`.

```bash
node dist/index.js doctor
node dist/index.js verify-remote
node dist/index.js fix
node dist/index.js check --phase commit
node dist/index.js check --phase push
node dist/index.js check --phase push --json
```

`verify-remote` performs an explicit SSH check. `fix` is a dry run unless `--apply` is supplied;
it only changes repository-local config and origin. Profiles are read from
`~/.config/gitguard/profiles.yml`. The tool never force-pushes or changes global Git configuration.
`--json` emits a stable `{ result, findings }` object for CI and coding agents.

For a fresh checkout, run `gitguard init` after setting the repository's expected local identity;
the sample GitHub Action demonstrates this without committing a repository identity file.
