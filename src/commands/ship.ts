import { readFile, writeFile } from 'node:fs/promises';
import { $ } from 'bun';

export default async function shipCommand() {
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  const name = pkg.name;
  
  console.log(`\nShipping ${name}...\n`);
  
  // 1. Run tests
  console.log('  Running tests...');
  const testResult = await $`bun test`.quiet();
  if (testResult.exitCode !== 0) {
    console.error('  ✗ Tests failed');
    process.exit(1);
  }
  console.log('  ✓ Tests pass');
  
  // 2. Build with vite if vite.config.ts exists
  try {
    await readFile('vite.config.ts');
    console.log('  Building with vite...');
    await $`npx vite build`.quiet();
    console.log('  ✓ Build complete');
  } catch {
    console.log('  (no vite.config.ts — skipping build)');
  }
  
  // 3. Bump patch version
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  pkg.version = `${major}.${minor}.${patch + 1}`;
  await writeFile('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  ✓ Bumped to ${pkg.version}`);
  
  // 4. Git commit + tag
  await $`git add -A`.quiet();
  await $`git commit -m ${pkg.version}`.quiet();
  await $`git tag v${pkg.version}`.quiet();
  console.log(`  ✓ Tagged v${pkg.version}`);
  
  // 5. Push
  await $`git push origin main --tags`.quiet();
  console.log('  ✓ Pushed');
  
  // 6. Publish to npm
  await $`bun publish --access public`.quiet();
  console.log('  ✓ Published to npm');
  
  console.log(`\n${name} v${pkg.version} shipped!\n`);
}