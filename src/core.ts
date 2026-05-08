import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import fg from 'fast-glob';
import { getPackages } from '@manypkg/get-packages';

export const DEFAULT_SNAPSHOT_PLACEHOLDER = '__VERSION__';
export const DEFAULT_RELEASE_PLACEHOLDER = '__VERSION!__';
export const CHANGESET_CONFIG_PATH = '.changeset/config.json';

export type Placeholder = string | string[];
export type StampMode = 'snapshot' | 'release';

export interface PackageStampOptions {
  packageJson: string;
  files: string[];
  exclude?: string[];
  placeholder?: Placeholder;
  mode?: StampMode;
}

export interface StampOptions {
  cwd?: string;
  dryRun?: boolean;
  packages: PackageStampOptions[];
}

export interface StampResult {
  packageJson: string;
  version: string;
  file: string;
  mode: StampMode;
  replacements: number;
}

export interface StampPackageConfig {
  package?: string;
  packageJson?: string;
  files?: string[];
  include?: string[];
  exclude?: string[];
  placeholder?: Placeholder;
  mode?: StampMode;
}

export interface StampConfig {
  /** Default mode. snapshot = one-time replacement; release = repeatable replacement before publish. */
  mode?: StampMode;
  /** Files/globs to scan relative to each package directory. */
  files?: string[];
  /** Alias for files. */
  include?: string[];
  /** Files/globs to ignore relative to each package directory. */
  exclude?: string[];
  /** Snapshot placeholder token(s). */
  placeholder?: Placeholder;
  /** Alias for snapshot placeholder token(s). */
  snapshotPlaceholder?: Placeholder;
  /** Release placeholder token(s). */
  releasePlaceholder?: Placeholder;
  /** Per-package overrides. Omit to discover packages with @manypkg/get-packages. */
  packages?: Array<string | StampPackageConfig>;
}

export interface ChangesetConfigWithStamp {
  changesetStamp?: StampConfig;
  stamp?: StampConfig;
}

export function normalizePlaceholders(placeholder: Placeholder): string[] {
  const placeholders = Array.isArray(placeholder) ? placeholder : [placeholder];
  if (placeholders.length === 0) throw new Error('placeholder must not be empty');
  for (const item of placeholders) {
    if (!item) throw new Error('placeholder must not be empty');
  }
  return placeholders;
}

export function defaultPlaceholderForMode(mode: StampMode): string {
  return mode === 'release' ? DEFAULT_RELEASE_PLACEHOLDER : DEFAULT_SNAPSHOT_PLACEHOLDER;
}

export function placeholderForMode(config: StampConfig, mode: StampMode): Placeholder {
  if (mode === 'release') return config.releasePlaceholder ?? defaultPlaceholderForMode(mode);
  return config.snapshotPlaceholder ?? config.placeholder ?? defaultPlaceholderForMode(mode);
}

export function replaceVersionPlaceholder(
  source: string,
  version: string,
  placeholder: Placeholder = DEFAULT_SNAPSHOT_PLACEHOLDER,
): { text: string; replacements: number } {
  let text = source;
  let replacements = 0;

  for (const token of normalizePlaceholders(placeholder)) {
    const count = text.includes(token) ? text.split(token).length - 1 : 0;
    replacements += count;
    text = text.replaceAll(token, version);
  }

  return { text, replacements };
}

export function replaceReleasePlaceholder(
  source: string,
  version: string,
  placeholder: Placeholder = DEFAULT_RELEASE_PLACEHOLDER,
): { text: string; replacements: number } {
  let text = source;
  let replacements = 0;

  for (const token of normalizePlaceholders(placeholder)) {
    const escaped = escapeRegExp(token);
    const pattern = new RegExp(`${escaped}(?:\\[[^\\]]*\\])?`, 'g');
    text = text.replace(pattern, () => {
      replacements += 1;
      return `${token}[${version}]`;
    });
  }

  return { text, replacements };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function readPackageVersion(packageJsonPath: string): Promise<string> {
  const raw = await readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw) as { version?: unknown };
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error(`${packageJsonPath} does not contain a valid version field`);
  }
  return pkg.version;
}

export async function stampFiles(options: StampOptions): Promise<StampResult[]> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const results: StampResult[] = [];

  for (const pkg of options.packages) {
    const mode = pkg.mode ?? 'snapshot';
    const packageJson = resolve(cwd, pkg.packageJson);
    const packageDir = dirname(packageJson);
    const version = await readPackageVersion(packageJson);
    const placeholder = pkg.placeholder ?? defaultPlaceholderForMode(mode);
    const ignore = ['**/node_modules/**', ...(pkg.exclude ?? [])];

    for (const filePattern of pkg.files) {
      const matches = await fg(filePattern, {
        cwd: packageDir,
        absolute: true,
        onlyFiles: true,
        dot: true,
        ignore,
      });

      if (matches.length === 0) {
        results.push({ packageJson, version, file: resolve(packageDir, filePattern), mode, replacements: 0 });
        continue;
      }

      for (const file of matches) {
        const buffer = await readFile(file);
        if (isBinaryBuffer(buffer)) {
          results.push({ packageJson, version, file, mode, replacements: 0 });
          continue;
        }

        const source = buffer.toString('utf8');
        const { text, replacements } =
          mode === 'release'
            ? replaceReleasePlaceholder(source, version, placeholder)
            : replaceVersionPlaceholder(source, version, placeholder);

        if (!options.dryRun && replacements > 0) {
          await writeFile(file, text);
        }

        results.push({ packageJson, version, file, mode, replacements });
      }
    }
  }

  return results;
}

export function isBinaryBuffer(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  if (sample.includes(0)) return true;

  const text = sample.toString('utf8');
  const replacementChars = [...text].filter((char) => char === '\uFFFD').length;
  return replacementChars > 0 && replacementChars / text.length > 0.01;
}

export async function expandPackagePatterns(patterns: string[], cwd = process.cwd()): Promise<string[]> {
  const normalized = patterns.map((pattern) => {
    if (pattern.endsWith('package.json')) return pattern;
    return `${pattern.replace(/\/$/, '')}/package.json`;
  });

  const matches = await fg(normalized, {
    cwd,
    absolute: false,
    onlyFiles: true,
    dot: true,
    ignore: ['**/node_modules/**'],
  });

  return [...new Set(matches)].sort();
}


export async function readWorkspacePackageJsons(cwd = process.cwd()): Promise<string[]> {
  const { packages } = await getPackages(cwd);
  return packages.map((pkg) => join(pkg.relativeDir, 'package.json')).sort();
}

export async function readChangesetStampConfig(
  configPath = CHANGESET_CONFIG_PATH,
  cwd = process.cwd(),
): Promise<StampConfig> {
  const fullPath = resolve(cwd, configPath);
  const raw = await readFile(fullPath, 'utf8');
  const config = JSON.parse(raw) as ChangesetConfigWithStamp;
  return config.changesetStamp ?? config.stamp ?? {};
}

export async function configToPackages(
  config: StampConfig,
  options: {
    cwd?: string;
    packageJson?: string;
    files?: string[];
    placeholder?: Placeholder;
    mode?: StampMode;
    packagePatterns?: string[];
    exclude?: string[];
  } = {},
): Promise<PackageStampOptions[]> {
  const cwd = options.cwd ?? process.cwd();
  const defaultMode = options.mode ?? config.mode ?? 'snapshot';
  const defaultFiles = options.files ?? config.files ?? config.include ?? [];
  const defaultPlaceholder = options.placeholder ?? placeholderForMode(config, defaultMode);
  const defaultExclude = options.exclude ?? config.exclude;

  if (config.packages && config.packages.length > 0) {
    const packages: PackageStampOptions[] = [];

    for (const item of config.packages) {
      if (typeof item === 'string') {
        const packageJsons = await expandPackagePatterns([item], cwd);
        for (const packageJson of packageJsons) {
          packages.push({ packageJson, files: defaultFiles, exclude: defaultExclude, placeholder: defaultPlaceholder, mode: defaultMode });
        }
      } else {
        const pattern = item.packageJson ?? item.package;
        if (!pattern) throw new Error('package entry requires package or packageJson');
        const mode = item.mode ?? defaultMode;
        const packageJsons = await expandPackagePatterns([pattern], cwd);
        for (const packageJson of packageJsons) {
          packages.push({
            packageJson,
            files: item.files ?? item.include ?? defaultFiles,
            exclude: item.exclude ?? defaultExclude,
            placeholder: item.placeholder ?? options.placeholder ?? placeholderForMode(config, mode),
            mode,
          });
        }
      }
    }

    return packages;
  }

  if (options.packagePatterns && options.packagePatterns.length > 0) {
    const packageJsons = await expandPackagePatterns(options.packagePatterns, cwd);
    return packageJsons.map((packageJson) => ({
      packageJson,
      files: defaultFiles,
      exclude: defaultExclude,
      placeholder: defaultPlaceholder,
      mode: defaultMode,
    }));
  }

  const packageJsons = options.packageJson
    ? [options.packageJson]
    : await readWorkspacePackageJsons(cwd);

  return packageJsons.map((packageJson) => ({
    packageJson,
    files: defaultFiles,
    exclude: defaultExclude,
    placeholder: defaultPlaceholder,
    mode: defaultMode,
  }));
}
