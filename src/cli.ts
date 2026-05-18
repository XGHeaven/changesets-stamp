import { defineCommand, runMain } from 'citty';
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

function collectOptionValues(rawArgs: string[], names: string[]): string[] {
  const values: string[] = [];

  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    const name = names.find((item) => arg === `--${item}` || arg.startsWith(`--${item}=`) || arg === `-${item}`);
    if (!name) continue;

    const longPrefix = `--${name}=`;
    if (arg.startsWith(longPrefix)) {
      values.push(arg.slice(longPrefix.length));
      continue;
    }

    const value = rawArgs[i + 1];
    if (!value || value.startsWith('-')) continue;
    values.push(value);
    i += 1;
  }

  return values;
}

function optionValue<T>(value: T | T[] | undefined): T | undefined {
  return Array.isArray(value) ? value.at(-1) : value;
}

function optionValues(value: string | string[] | undefined, rawArgs: string[], names: string[]): string[] {
  const collected = collectOptionValues(rawArgs, names);
  if (collected.length > 0) return collected;
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

const main = defineCommand({
  meta: {
    name: 'changesets-stamp',
    description: 'Stamp package version placeholders after Changesets updates package.json.',
  },
  args: {
    config: {
      type: 'string',
      alias: 'c',
      default: CHANGESET_CONFIG_PATH,
      valueHint: 'path',
      description: 'Path to Changesets config JSON.',
    },
    package: {
      type: 'string',
      alias: 'p',
      valueHint: 'path',
      description: 'Package JSON path override. By default packages are discovered automatically.',
    },
    exclude: {
      type: 'string',
      valueHint: 'glob',
      description: 'Glob to exclude. Can be repeated.',
    },
    placeholder: {
      type: 'string',
      valueHint: 'token',
      description: 'Placeholder token. Can be repeated.',
    },
    mode: {
      type: 'enum',
      options: ['snapshot', 'release'],
      valueHint: 'mode',
      description: 'Stamp mode.',
    },
    snapshot: {
      type: 'boolean',
      description: `Shortcut for --mode snapshot (${DEFAULT_SNAPSHOT_PLACEHOLDER} -> version).`,
    },
    release: {
      type: 'boolean',
      description: `Shortcut for --mode release (${DEFAULT_RELEASE_PLACEHOLDER} -> ${DEFAULT_RELEASE_PLACEHOLDER}[version]).`,
    },
    'dry-run': {
      type: 'boolean',
      description: 'Print what would be stamped without writing files.',
    },
  },
  async run({ args, rawArgs }) {
    const configPath = optionValue(args.config) ?? CHANGESET_CONFIG_PATH;
    const packageJson = optionValue(args.package);
    let config = {};

    try {
      config = await readChangesetStampConfig(configPath);
    } catch (error) {
      if (configPath !== CHANGESET_CONFIG_PATH) throw error;
    }

    const mode = args.release ? 'release' : args.snapshot ? 'snapshot' : (optionValue(args.mode) as StampMode | undefined);
    const placeholders = optionValues(args.placeholder as string | string[] | undefined, rawArgs, ['placeholder']);
    const excludes = optionValues(args.exclude as string | string[] | undefined, rawArgs, ['exclude']);
    const placeholder: Placeholder | undefined = placeholders.length > 0 ? placeholders : undefined;
    const files = args._.length > 0 ? args._ : undefined;
    const packages = await configToPackages(config, {
      packageJson,
      files,
      placeholder,
      mode,
      exclude: excludes.length > 0 ? excludes : undefined,
    });

    const emptyFilePackages = packages.filter((pkg) => pkg.files.length === 0);
    if (emptyFilePackages.length > 0) {
      throw new Error('No files configured. Pass file globs as positional arguments or set stamp.include/files.');
    }

    const results = await stampFiles({ packages, dryRun: Boolean(args.dryRun) });

    for (const result of results) {
      const action = args.dryRun ? 'would stamp' : 'stamped';
      console.log(
        `${action} ${result.replacements} ${result.mode} placeholder(s): ${result.file} (${result.version} from ${result.packageJson})`,
      );
    }
  },
});

runMain(main);
