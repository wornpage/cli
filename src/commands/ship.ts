import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { $ } from 'bun';
import { verifyPackage } from './verify.ts';

const RELEASE_FILES = [
  'package.json',
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'npm-shrinkwrap.json',
] as const;

async function runGit(args: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    const detail = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    throw new Error(`git ${args.join(' ')} failed${detail ? `:\n${detail}` : '.'}`);
  }
  return stdout;
}

export async function assertCleanWorktree(directory = process.cwd()): Promise<void> {
  const status = await runGit(['status', '--porcelain=v1', '--untracked-files=all'], directory);
  if (status.trim()) {
    throw new Error(`Refusing to ship from a dirty worktree. Commit, stash, or remove every change first:\n${status.trimEnd()}`);
  }
}

export async function stageReleaseFiles(directory = process.cwd()): Promise<string[]> {
  const existing: string[] = [];
  for (const path of RELEASE_FILES) {
    try {
      await access(resolve(directory, path));
      existing.push(path);
    } catch {
      // A package may use only one supported lockfile format.
    }
  }

  await runGit(['add', '--', ...existing], directory);
  const staged = (await runGit(['diff', '--cached', '--name-only', '-z', '--'], directory))
    .split('\0')
    .filter(Boolean);
  const unexpected = staged.filter((path) => !RELEASE_FILES.includes(path as typeof RELEASE_FILES[number]));
  if (unexpected.length > 0) {
    throw new Error(`Refusing to ship unexpected staged files:\n- ${unexpected.join('\n- ')}`);
  }
  if (!staged.includes('package.json')) {
    throw new Error('Version bump did not stage package.json.');
  }
  return staged;
}

export default async function shipCommand(directory = process.cwd()) {
  await assertCleanWorktree(directory);

  const pkg = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf-8'));
  const name = pkg.name;
  
  console.log(`\nShipping ${name}...\n`);
  
  // 1. Verify the shared package contract before versioning anything.
  console.log('  Verifying release contract...');
  await verifyPackage(directory, { frozenDist: true });
  await assertCleanWorktree(directory);
  console.log('  ✓ Source, build, demo, tests, and package verified');
  
  // 2. Bump patch version
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  pkg.version = `${major}.${minor}.${patch + 1}`;
  await writeFile(resolve(directory, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  ✓ Bumped to ${pkg.version}`);
  
  // 3. Git commit + tag
  const staged = await stageReleaseFiles(directory);
  await $`git commit -m ${pkg.version} -- ${staged}`.cwd(directory).quiet();
  await $`git tag v${pkg.version}`.cwd(directory).quiet();
  console.log(`  ✓ Tagged v${pkg.version}`);
  
  // 4. Push
  await $`git push origin main --tags`.cwd(directory).quiet();
  console.log('  ✓ Pushed');
  
  // 5. Publish to npm
  await $`bun publish --access public`.cwd(directory).quiet();
  console.log('  ✓ Published to npm');
  
  console.log(`\n${name} v${pkg.version} shipped!\n`);
}
