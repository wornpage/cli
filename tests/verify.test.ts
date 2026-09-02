import { afterEach, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findComponentPackages, inspectPackage, verifyPackage } from '../src/commands/verify.ts';
import {
  DELIVERY_CONTRACT_VERSION,
  DELIVERY_GIT_ATTRIBUTES,
  renderDeliveryReadmeSection,
  renderDeliveryWorkflow,
} from '../src/delivery.ts';

const TMP = join(import.meta.dir, '..', '.verify-tmp');
setDefaultTimeout(30_000);

async function writeReleaseWorkflow(root: string) {
  const workflowDirectory = join(root, '.github', 'workflows');
  await mkdir(workflowDirectory, { recursive: true });
  await writeFile(join(workflowDirectory, 'release-contract.yml'), renderDeliveryWorkflow());
}

async function writeDeliveryAttributes(root: string) {
  await writeFile(join(root, '.gitattributes'), DELIVERY_GIT_ATTRIBUTES);
}

async function makeSourcePackage(name: string) {
  const root = join(TMP, name);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'index.ts'), 'export const component = true;\n');
  await writeFile(join(root, 'README.md'), `# Source fixture\n\n${renderDeliveryReadmeSection('source')}\n`);
  await writeReleaseWorkflow(root);
  await writeDeliveryAttributes(root);
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: `@wornpage/${name}`,
    version: '1.0.0',
    type: 'module',
    wornpage: { contractVersion: DELIVERY_CONTRACT_VERSION, delivery: 'source' },
    scripts: { test: 'bun -e "process.exit(0)"' },
    main: './src/index.ts',
    svelte: './src/index.ts',
    exports: { '.': { types: './src/index.ts', svelte: './src/index.ts', default: './src/index.ts' } },
    files: ['src'],
  }, null, 2));
  return root;
}

async function makeBundlePackage(name: string, distContent: string) {
  const root = join(TMP, name);
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(root, 'src', 'index.ts'), 'export const component = true;\n');
  await writeFile(join(root, 'dist', 'widget.js'), distContent);
  await writeFile(join(root, 'README.md'), `# Bundle fixture\n\n${renderDeliveryReadmeSection('browser-bundle')}\n`);
  await writeReleaseWorkflow(root);
  await writeDeliveryAttributes(root);
  await writeFile(join(root, 'build.ts'), [
    "import { mkdir, writeFile } from 'node:fs/promises';",
    "await mkdir('dist', { recursive: true });",
    "await writeFile('dist/widget.js', 'export const component = true;\\n');",
  ].join('\n'));
  await writeFile(join(root, 'index.html'), "<script type=\"module\">import './dist/widget.js';</script>\n");
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: `@wornpage/${name}`,
    version: '1.0.0',
    type: 'module',
    wornpage: { contractVersion: DELIVERY_CONTRACT_VERSION, delivery: 'browser-bundle' },
    scripts: { test: 'bun -e "process.exit(0)"', build: 'bun run build.ts' },
    main: './dist/widget.js',
    svelte: './src/index.ts',
    exports: { '.': { types: './src/index.ts', svelte: './src/index.ts', default: './dist/widget.js' } },
    files: ['src', 'dist'],
  }, null, 2));
  return root;
}

afterEach(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe('component release contract', () => {
  it('classifies and verifies a source-only package', async () => {
    const root = await makeSourcePackage('source-fixture');
    const contract = await verifyPackage(root);
    expect(contract.mode).toBe('source');
    expect(contract.sourceEntry).toBe('./src/index.ts');
    expect(contract.runtimeEntry).toBe('./src/index.ts');
  });

  it('rejects source-only packages that advertise an unused dist directory', async () => {
    const root = await makeSourcePackage('invalid-fixture');
    const pkgPath = join(root, 'package.json');
    const pkg = JSON.parse(await Bun.file(pkgPath).text());
    pkg.files.push('dist');
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2));

    await expect(inspectPackage(root)).rejects.toThrow('must not advertise dist/');
  });

  it('rejects packages without an explicit versioned delivery declaration', async () => {
    const root = await makeSourcePackage('undeclared-fixture');
    const pkgPath = join(root, 'package.json');
    const pkg = JSON.parse(await Bun.file(pkgPath).text());
    delete pkg.wornpage;
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2));

    await expect(inspectPackage(root)).rejects.toThrow('wornpage.contractVersion');
    await expect(inspectPackage(root)).rejects.toThrow('wornpage.delivery');
  });

  it('rejects packages without deterministic text checkout rules', async () => {
    const root = await makeSourcePackage('attributes-fixture');
    await rm(join(root, '.gitattributes'));

    await expect(inspectPackage(root)).rejects.toThrow('.gitattributes');
  });

  it('rejects a delivery declaration that disagrees with the runtime export', async () => {
    const root = await makeBundlePackage('mismatch-fixture', 'export const component = true;\n');
    const pkgPath = join(root, 'package.json');
    const pkg = JSON.parse(await Bun.file(pkgPath).text());
    pkg.wornpage.delivery = 'source';
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2));

    await expect(inspectPackage(root)).rejects.toThrow('declares source');
  });

  it('rejects missing or stale local delivery documentation', async () => {
    const root = await makeSourcePackage('undocumented-fixture');
    await writeFile(join(root, 'README.md'), '# Undocumented fixture\n');

    await expect(inspectPackage(root)).rejects.toThrow('README.md must include');
  });

  it('rejects a physical dist directory in a source-only package', async () => {
    const root = await makeSourcePackage('source-dist-fixture');
    await mkdir(join(root, 'dist'));

    await expect(inspectPackage(root)).rejects.toThrow('must not contain a dist/ directory');
  });

  it('rejects packages without the shared push and pull-request contract', async () => {
    const root = await makeSourcePackage('workflow-fixture');
    await rm(join(root, '.github'), { recursive: true });

    await expect(inspectPackage(root)).rejects.toThrow('release-contract.yml');
  });

  it('accepts any immutable CLI workflow revision and rejects mutable refs', async () => {
    const root = await makeSourcePackage('immutable-workflow-fixture');
    const workflowPath = join(root, '.github', 'workflows', 'release-contract.yml');
    const generated = await readFile(workflowPath, 'utf8');
    await writeFile(workflowPath, generated.replace(/@[0-9a-f]{40}/u, `@${'f'.repeat(40)}`));
    expect((await inspectPackage(root)).name).toBe('@wornpage/immutable-workflow-fixture');

    await writeFile(workflowPath, generated.replace(/@[0-9a-f]{40}/u, '@master'));
    await expect(inspectPackage(root)).rejects.toThrow('<full-lowercase-commit-sha>');
  });

  it('detects stale bundles and accepts a reproducible rebuild', async () => {
    const root = await makeBundlePackage('bundle-fixture', 'stale output\n');
    await expect(verifyPackage(root, { frozenDist: true })).rejects.toThrow('dist/ is stale');

    const contract = await verifyPackage(root, { frozenDist: true });
    expect(contract.mode).toBe('bundle');
    expect(contract.demoEntry).toBe('./index.html');
  });

  it('rejects a demo that does not load the declared bundle', async () => {
    const root = await makeBundlePackage('demo-fixture', 'export const component = true;\n');
    await writeFile(join(root, 'index.html'), '<main>No component bundle</main>\n');
    await expect(inspectPackage(root)).rejects.toThrow('index.html must load');
  });

  it('requires a consuming demo for browser bundles', async () => {
    const root = await makeBundlePackage('missing-demo-fixture', 'export const component = true;\n');
    await rm(join(root, 'index.html'));

    await expect(inspectPackage(root)).rejects.toThrow('must include an index.html');
  });

  it('discovers standalone packages without treating tooling as a component', async () => {
    const component = await makeSourcePackage('discoverable');
    const tool = join(TMP, 'tooling');
    await mkdir(tool, { recursive: true });
    await writeFile(join(tool, 'package.json'), JSON.stringify({
      name: '@wornpage/tooling',
      bin: { tooling: './src/index.ts' },
    }));

    expect(await findComponentPackages(TMP)).toEqual([component]);
  });
});
