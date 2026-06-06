# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

Workflow:

1. Make changes to one or more packages.
2. Run `pnpm changeset` and describe the change (pick a semver bump per affected package).
3. Commit the generated changeset file alongside your work.
4. When ready to publish, run `pnpm version-packages` to apply version bumps and changelogs, then `pnpm release` to build and publish to npm.

The `access: public` setting in `config.json` ensures scoped `@xsynaptic/*` packages publish publicly.
