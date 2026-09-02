import { afterEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertCleanWorktree, stageReleaseFiles } from '../src/commands/ship.ts';

const TMP = join(import.meta.dir, '..', '.test-tmp', 'ship');

async function git(directory: string, ...args: string[]): Promise<string> {
  const child = Bun.spawn(['git', ...args], { cwd: directory, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(stderr || `git ${args.join(' ')} failed`);
  return stdout;
}

async function repository(): Promise<string> {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  await git(TMP, 'init', '--quiet');
  await git(TMP, 'config', 'user.name', 'Ship Test');
  await git(TMP, 'config', 'user.email', 'ship-test@example.invalid');
  await writeFile(join(TMP, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n');
  await writeFile(join(TMP, 'bun.lock'), 'lock\n');
  await writeFile(join(TMP, 'README.md'), 'fixture\n');
  await git(TMP, 'add', '.');
  await git(TMP, 'commit', '--quiet', '-m', 'fixture');
  return TMP;
}

afterEach(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe('ship safety boundary', () => {
  it('refuses tracked and untracked changes before release work starts', async () => {
    const root = await repository();
    await writeFile(join(root, 'local-secret.txt'), 'do not publish\n');

    await expect(assertCleanWorktree(root)).rejects.toThrow('Refusing to ship from a dirty worktree');
    await expect(assertCleanWorktree(root)).rejects.toThrow('local-secret.txt');
  });

  it('stages only the package manifest and supported lockfiles', async () => {
    const root = await repository();
    await writeFile(join(root, 'package.json'), '{"name":"fixture","version":"1.0.1"}\n');
    await writeFile(join(root, 'bun.lock'), 'updated lock\n');
    await writeFile(join(root, 'README.md'), 'unrelated change\n');

    expect(await stageReleaseFiles(root)).toEqual(['bun.lock', 'package.json']);
    expect((await git(root, 'diff', '--cached', '--name-only')).trim().split(/\r?\n/u).sort()).toEqual([
      'bun.lock',
      'package.json',
    ]);
    expect(await git(root, 'diff', '--name-only')).toContain('README.md');
  });
});
