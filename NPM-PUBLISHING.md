# npm releases

We publish `@irl-commons/stream-status` from `packages/typescript`.
The first version is **0.1.0**, MIT licensed, with ESM, declarations and the
`stream-status` CLI. Its supported Node runtimes are declared in
[`packages/typescript/package.json`](packages/typescript/package.json) (`engines.node`),
and it has no runtime dependencies.

Our [shared release guide](https://github.com/irl-commons/irl-commons/blob/main/NPM-PUBLISHING.md)
and [governance](https://github.com/irl-commons/irl-commons/blob/main/GOVERNANCE.md)
apply. While one steward is listed, bootstrap permits their own PR to merge
after checks pass; objections still block. With two stewards, independent review
and the rules-change wait apply. Declare affiliations in the PR.

## One-time setup (an npm owner, with 2FA)

Use the Node version in [`.nvmrc`](.nvmrc) (`nvm install && nvm use`)
and its bundled npm for the interactive commands. The npm version is recorded
in `packages/typescript/package.json` (`packageManager`). Check `npm stage --help` first.
Enable account 2FA and check the organisation ownership requirements in the
shared guide. Log in with `npm login`.

If the package does not exist yet, follow the shared guide's minimal two-file
placeholder procedure, substituting `@irl-commons/stream-status` and `MIT`.
Publish **only** that placeholder as `0.0.0-bootstrap.0` under `bootstrap`, then
read back versions and dist-tags. Do not stage and reject the only version:
that removes the package and prevents reuse of the name for 24 hours.

In package Settings → Trusted publishing, choose GitHub Actions and set:

- Organisation: `irl-commons`
- Repository: `stream-status`
- Workflow: `publish.yml`
- Environment: `npm-release`
- Allowed action: **stage publish only** (no direct publish or dist-tag access)

Alternatively, after login, run this in a short local CLI session. `trust`
requires 2FA too; pass the fresh code through `npm_config_otp`, not just login.
Keep the code out of shell history and clear it afterwards:

```sh
read -r -s -p 'npm 2FA code: ' npm_config_otp; echo
export npm_config_otp
npm trust github @irl-commons/stream-status --file publish.yml --repo irl-commons/stream-status --env npm-release --allow-stage-publish
unset npm_config_otp
npm trust list @irl-commons/stream-status
```

Read back those exact settings. In package Settings → Publishing access, select
**Require two-factor authentication and disallow tokens**. No npm token belongs
in GitHub secrets. Make the first successful publish within two days of setup;
otherwise renew the trusted-publisher configuration.

## Each release

A steward creates a reviewed `v0.1.0` tag on main for the first release.
Both release-tag rulesets must be active: admin-only creation and no updates
or deletion, even for admins. The `npm-release` environment must have exactly
one deployment policy: `v*`, type `tag`. With two stewards, require an environment
reviewer and prevent self-review; bootstrap has no required reviewer.

The tag starts `publish.yml`. Its read-only verify job checks main ancestry,
tag/version agreement, generated sources, compiled tests, the isolated packed
package, Python fixtures and cross-language conformance. It builds and uploads
the npm tarball. The publish job alone has `id-token: write`, enters
`npm-release`, downloads that tarball and runs
`npm stage publish <tarball> --ignore-scripts --provenance --access public`.
It installs no dependencies and runs no package lifecycle scripts. This is
staged publishing with SLSA provenance, not an immediate public 0.1.0 release.
`prepublishOnly` runs local build/tests only; it does no network work.

An owner reviews the staged package on npmjs.com → Staged Packages and approves
it with 2FA. Then check `latest`, version 0.1.0 and its provenance/repository link.
**`0.0.0-stage` stays.** npm uses it for staging; do not unpublish it or try to
make the versions list contain only real releases. The optional bootstrap
placeholder is separate: remove it only after 0.1.0 exists and only within npm's
unpublish window; otherwise deprecate it. Log out after the CLI session.

Preparing or merging this setup does not authorize creating a tag, configuring
npm trust, or publishing. Those steps wait for an npm owner with 2FA.
