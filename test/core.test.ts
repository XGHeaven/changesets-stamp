import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  configToPackages,
  readChangesetStampConfig,
  replaceReleasePlaceholder,
  replaceVersionPlaceholder,
  stampFiles,
} from '../src/core.js';

describe('replaceVersionPlaceholder', () => {
  it('replaces snapshot placeholders once', () => {
    const result = replaceVersionPlaceholder('v=__VERSION__', '1.2.3');
    expect(result).toEqual({ text: 'v=1.2.3', replacements: 1 });
  });

  it('supports multiple configured placeholders', () => {
    const result = replaceVersionPlaceholder('__V__ / __OLD_VERSION__', '2.0.0', [
      '__V__',
      '__OLD_VERSION__',
    ]);
    expect(result).toEqual({ text: '2.0.0 / 2.0.0', replacements: 2 });
  });

  it('respects exclude globs and skips binary files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'changeset-stamp-'));
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '3.0.0' }));
      await writeFile(join(dir, 'keep.ts'), '__VERSION__');
      await writeFile(join(dir, 'skip.ts'), '__VERSION__');
      await writeFile(join(dir, 'asset.bin'), Buffer.from([0, 1, 2, 95, 95, 86, 69, 82, 83, 73, 79, 78, 95, 95]));

      const results = await stampFiles({
        cwd: dir,
        packages: [{ packageJson: 'package.json', files: ['**/*'], exclude: ['skip.ts'] }],
      });

      expect(results.find((item) => item.file.endsWith('keep.ts'))?.replacements).toBe(1);
      expect(results.find((item) => item.file.endsWith('asset.bin'))?.replacements).toBe(0);
      await expect(readFile(join(dir, 'keep.ts'), 'utf8')).resolves.toBe('3.0.0');
      await expect(readFile(join(dir, 'skip.ts'), 'utf8')).resolves.toBe('__VERSION__');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

});

describe('replaceReleasePlaceholder', () => {
  it('keeps the release placeholder so replacement is repeatable', () => {
    const first = replaceReleasePlaceholder('v=__VERSION!__', '1.2.3');
    expect(first).toEqual({ text: 'v=__VERSION!__[1.2.3]', replacements: 1 });

    const second = replaceReleasePlaceholder(first.text, '1.2.4');
    expect(second).toEqual({ text: 'v=__VERSION!__[1.2.4]', replacements: 1 });
  });
});

describe('changeset config', () => {
  it('reads stamp config from .changeset/config.json extension', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'changeset-stamp-'));
    try {
      await mkdir(join(dir, '.changeset'), { recursive: true });
      await writeFile(
        join(dir, '.changeset/config.json'),
        JSON.stringify({ changelog: false, changesetStamp: { files: ['src/version.ts'] } }),
      );
      await expect(readChangesetStampConfig('.changeset/config.json', dir)).resolves.toEqual({
        files: ['src/version.ts'],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('stampFiles', () => {
  it('stamps one package', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'changeset-stamp-'));
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
      await writeFile(join(dir, 'version.ts'), 'export const version = "__VERSION__";');

      const results = await stampFiles({
        cwd: dir,
        packages: [{ packageJson: 'package.json', files: ['version.ts'] }],
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.replacements).toBe(1);
      await expect(readFile(join(dir, 'version.ts'), 'utf8')).resolves.toContain('1.2.3');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('expands monorepo package globs from config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'changeset-stamp-'));
    try {
      await mkdir(join(dir, 'packages/a'), { recursive: true });
      await mkdir(join(dir, 'packages/b'), { recursive: true });
      await writeFile(join(dir, 'packages/a/package.json'), JSON.stringify({ version: '1.0.0' }));
      await writeFile(join(dir, 'packages/b/package.json'), JSON.stringify({ version: '2.0.0' }));
      await writeFile(join(dir, 'packages/a/version.ts'), '__VERSION__');
      await writeFile(join(dir, 'packages/b/version.ts'), '__VERSION__');

      const packages = await configToPackages(
        { packages: ['packages/*'], files: ['version.ts'], placeholder: '__VERSION__' },
        { cwd: dir },
      );
      const results = await stampFiles({ cwd: dir, packages });

      expect(results.map((item) => item.version).sort()).toEqual(['1.0.0', '2.0.0']);
      await expect(readFile(join(dir, 'packages/a/version.ts'), 'utf8')).resolves.toBe('1.0.0');
      await expect(readFile(join(dir, 'packages/b/version.ts'), 'utf8')).resolves.toBe('2.0.0');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
