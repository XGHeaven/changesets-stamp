#!/usr/bin/env node
import {
  CHANGESET_CONFIG_PATH,
  configToPackages,
  DEFAULT_RELEASE_PLACEHOLDER,
  DEFAULT_SNAPSHOT_PLACEHOLDER,
  type Placeholder,
  readChangesetStampConfig,
  stampFiles,
  type StampMode,
} from './core.js';

interface Args {
  config: string;
  packageJson: string;
  packagePatterns: string[];
  files: string[];
  exclude: string[];
  placeholders: string[];
  mode?: StampMode;
  dryRun: boolean;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function parseMode(value: string): StampMode {
  if (value === 'snapshot' || value === 'release') return value;
  throw new Error(`invalid mode: ${value}. Expected snapshot or release`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    config: CHANGESET_CONFIG_PATH,
    packageJson: 'package.json',
    packagePatterns: [],
    files: [],
    exclude: [],
    placeholders: [],
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config' || arg === '-c') args.config = readValue(argv, i++, arg);
    else if (arg === '--package' || arg === '-p') args.packageJson = readValue(argv, i++, arg);
    else if (arg === '--packages') args.packagePatterns.push(readValue(argv, i++, arg));
    else if (arg === '--exclude') args.exclude.push(readValue(argv, i++, arg));
    else if (arg === '--placeholder') args.placeholders.push(readValue(argv, i++, arg));
    else if (arg === '--mode') args.mode = parseMode(readValue(argv, i++, arg));
    else if (arg === '--snapshot') args.mode = 'snapshot';
    else if (arg === '--release') args.mode = 'release';
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else args.files.push(arg);
  }

  return args;
}

function printHelp(): void {
  console.log(`changesets-stamp

Stamp package version placeholders after Changesets updates package.json.
Configuration is read from ${CHANGESET_CONFIG_PATH} by default.

Usage:
  # single package, snapshot mode
  changesets-stamp [files...] [--package package.json] [--placeholder token] [--exclude glob]

  # release mode, repeatable before publish
  changesets-stamp --release [files...]

  # monorepo / multi-package
  changesets-stamp --packages "packages/*" [files...] [--mode snapshot|release] [--exclude glob]

Modes:
  snapshot  one-time replacement, e.g. ${DEFAULT_SNAPSHOT_PLACEHOLDER} -> 1.2.3
  release   repeatable replacement, e.g. ${DEFAULT_RELEASE_PLACEHOLDER} -> ${DEFAULT_RELEASE_PLACEHOLDER}[1.2.3]

Scan range:
  Positional files are glob patterns relative to each package directory.
  Use --exclude or config.exclude to skip paths. Binary files are skipped automatically.

Recommended placeholders:
  snapshot: ${DEFAULT_SNAPSHOT_PLACEHOLDER}
  release:  ${DEFAULT_RELEASE_PLACEHOLDER}
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let config = {};

  try {
    config = await readChangesetStampConfig(args.config);
  } catch (error) {
    if (args.config !== CHANGESET_CONFIG_PATH) throw error;
  }

  const placeholder: Placeholder | undefined = args.placeholders.length > 0 ? args.placeholders : undefined;
  const files = args.files.length > 0 ? args.files : undefined;
  const packages = await configToPackages(config, {
    packageJson: args.packageJson,
    packagePatterns: args.packagePatterns,
    files,
    placeholder,
    mode: args.mode,
    exclude: args.exclude.length > 0 ? args.exclude : undefined,
  });

  const emptyFilePackages = packages.filter((pkg) => pkg.files.length === 0);
  if (emptyFilePackages.length > 0) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const results = await stampFiles({ packages, dryRun: args.dryRun });

  for (const result of results) {
    const action = args.dryRun ? 'would stamp' : 'stamped';
    console.log(
      `${action} ${result.replacements} ${result.mode} placeholder(s): ${result.file} (${result.version} from ${result.packageJson})`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
