# gitguard

Repository-aware Git identity guard for machines that use multiple GitHub accounts.

It checks local commit identity, the `origin` owner, SSH host aliases, and branch history before
commit or push. It stores repository policy in `.git/gitidentity.yml` and never stores credentials.

```bash
npm install
npm run build
node dist/index.js init
node dist/index.js status
node dist/index.js install-hooks
```

The hooks block mismatched commit authors and remote owners. Existing hooks are preserved as
`.gitguard-original`. `check-history` checks commits after the merge-base with `main`.

MVP limitations: SSH identity is inferred from `~/.ssh/config`; `verify-remote`, profile switching,
and automatic repairs are not implemented yet. The tool never force-pushes or changes global Git
configuration.
