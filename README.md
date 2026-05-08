# changesets-stamp

Post-Changesets helper that updates version placeholders inside package files after `changeset version` bumps `package.json`.

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
