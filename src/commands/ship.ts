import { readFile, writeFile } from 'node:fs/promises';
import { $ } from 'bun';
import { verifyPackage } from './verify.ts';

export default async function shipCommand() {
  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  const name = pkg.name;
  
  console.log(`\nShipping ${name}...\n`);
  
  // 1. Verify the shared package contract before versioning anything.
  console.log('  Verifying release contract...');
  await verifyPackage(process.cwd());
  console.log('  ✓ Source, build, demo, tests, and package verified');
  
  // 2. Bump patch version
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  pkg.version = `${major}.${minor}.${patch + 1}`;
  await writeFile('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  ✓ Bumped to ${pkg.version}`);
  
  // 3. Git commit + tag
  await $`git add -A`.quiet();
  await $`git commit -m ${pkg.version}`.quiet();
  await $`git tag v${pkg.version}`.quiet();
  console.log(`  ✓ Tagged v${pkg.version}`);
  
  // 4. Push
  await $`git push origin main --tags`.quiet();
  console.log('  ✓ Pushed');
  
  // 5. Publish to npm
  await $`bun publish --access public`.quiet();
  console.log('  ✓ Published to npm');
  
  console.log(`\n${name} v${pkg.version} shipped!\n`);
}
