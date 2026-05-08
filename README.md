# changesets-stamp

Post-Changesets helper that updates version placeholders inside package files after `changeset version` bumps `package.json`.

## Background

Changesets is great at calculating versions and updating `package.json`, but some packages also need the resolved version written into source files, generated metadata, templates, or documentation.

Common examples:

- a CLI wants to expose its package version from `src/version.ts`
- a browser bundle needs a build-time version constant
- docs or templates contain a placeholder that should match the package version
- a monorepo package needs its own local version stamped, not the workspace root version

`changesets-stamp` is designed to run **after** `changeset version`. It reads the package versions that Changesets already wrote, discovers packages automatically, scans configured files, and replaces version placeholders.

It does not calculate versions itself and does not replace Changesets.

## Quick start

Install it as a dev dependency:

```bash
pnpm add -D changesets-stamp
```

Add placeholders to files that should receive the package version:

```ts
export const version = '__VERSION__';
```

Configure the scan range in `.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": false,
  "access": "restricted",
  "baseBranch": "main",
  "changesetStamp": {
    "include": ["src/version.ts"]
  }
}
```

Run it after Changesets versions packages:

```bash
changeset version
changesets-stamp
```

The placeholder is replaced with the package's current `package.json` version:

```ts
export const version = '1.2.3';
```

## Usage

```bash
changesets-stamp [files...] [options]
```

Options:

- `-c, --config <path>`: path to Changesets config JSON. Defaults to `.changeset/config.json`
- `-p, --package <path>`: force a specific `package.json` instead of automatic package discovery
- `--placeholder <token>`: placeholder token to replace. Can be repeated
- `--exclude <glob>`: exclude glob. Can be repeated
- `--mode snapshot|release`: replacement mode
- `--snapshot`: shortcut for `--mode snapshot`
- `--release`: shortcut for `--mode release`
- `--dry-run`: print what would be stamped without writing files

Examples:

```bash
# use files from config
changesets-stamp

# override scan range from CLI
changesets-stamp "src/**/*.{ts,tsx}" README.md

# preview changes
changesets-stamp --dry-run

# use a custom placeholder
changesets-stamp --placeholder __APP_VERSION__

# force one package.json
changesets-stamp --package packages/cli/package.json src/version.ts
```

## Configuration

`changesets-stamp` extends Changesets' own config file and reads `.changeset/config.json` by default.

```json
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": false,
  "access": "restricted",
  "baseBranch": "main",
  "changesetStamp": {
    "mode": "snapshot",
    "snapshotPlaceholder": "__VERSION__",
    "releasePlaceholder": "__VERSION!__",
    "include": ["src/**/*.ts", "README.md"],
    "exclude": ["**/*.png", "**/fixtures/**"]
  }
}
```

`stamp` is also accepted as a shorter alias for `changesetStamp`.

Configuration fields:

- `include` / `files`: files or globs to scan, relative to each package directory
- `exclude`: files or globs to skip, relative to each package directory
- `mode`: default replacement mode, `snapshot` or `release`
- `placeholder`: snapshot placeholder token or tokens
- `snapshotPlaceholder`: snapshot placeholder token or tokens
- `releasePlaceholder`: release placeholder token or tokens
- `packages`: optional per-package overrides. Omit for normal automatic package discovery

## Replacement modes

### Snapshot mode

Snapshot mode is for one-time replacement, usually when a component/template is updated and you want the placeholder removed.

```txt
__VERSION__ -> 1.2.3
```

Run:

```bash
changesets-stamp --snapshot src/version.ts
```

### Release mode

Release mode is for pre-publish replacement on every release. It keeps a stable marker by adding the version after the token, so future releases can replace it again.

Recommended token uses a special `!` character:

```txt
__VERSION!__ -> __VERSION!__[1.2.3]
__VERSION!__[1.2.3] -> __VERSION!__[1.2.4]
```

Run before publish:

```bash
changesets-stamp --release src/version.ts
```

## Scan range

Configure which files are scanned with `include`/`files`, and skip files with `exclude`.

```json
{
  "changesetStamp": {
    "include": ["src/**/*.{ts,tsx,js,jsx}", "README.md"],
    "exclude": ["**/*.snap", "**/dist/**"]
  }
}
```

CLI globs are also supported:

```bash
changesets-stamp "src/**/*.{ts,tsx}" README.md --exclude "**/*.snap"
```

Binary files are skipped automatically, even if they match the configured scan range.

## Single package

In a single-package repository, package discovery resolves to the root `package.json` automatically.

```bash
changeset version
changesets-stamp src/version.ts
```

Custom placeholder:

```bash
changesets-stamp src/version.ts --placeholder __APP_VERSION__
```

## Monorepo / multi-package

Each package uses its own `package.json` version. Package discovery is automatic through `@manypkg/get-packages`, so pnpm/npm/yarn/bun/lerna/rush workspace config is inherited instead of redefined here.

```bash
changeset version
changesets-stamp "src/**/*.ts"
```

JSON config only needs the scan range:

```json
{
  "changesetStamp": {
    "include": ["src/**/*.ts"]
  }
}
```

For each discovered package, scan globs are resolved relative to that package directory.

## Per-package config

Omit `packages` for normal automatic discovery. If a package needs custom stamping behavior, list that package explicitly.

```json
{
  "changesetStamp": {
    "mode": "snapshot",
    "include": ["src/version.ts"],
    "exclude": ["**/*.png"],
    "packages": [
      {
        "package": "tools/cli",
        "mode": "release",
        "include": ["src/meta.ts"],
        "exclude": ["src/generated/**"],
        "placeholder": "__CLI_VERSION!__"
      }
    ]
  }
}
```

## Dry run

```bash
changesets-stamp src/version.ts --dry-run
```
