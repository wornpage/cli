import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import {
  DELIVERY_CONTRACT_VERSION,
  DELIVERY_GIT_ATTRIBUTES,
  DELIVERY_WORKFLOW_REFERENCE,
  renderDeliveryReadmeSection,
  type DeliveryDeclaration,
} from '../delivery.ts';

type PackageJson = {
  name?: string;
  main?: string;
  svelte?: string;
  exports?: string | Record<string, unknown>;
  files?: string[];
  scripts?: Record<string, string>;
  bin?: string | Record<string, string>;
  workspaces?: unknown;
  wornpage?: {
    contractVersion?: unknown;
    delivery?: unknown;
  };
};

export type DeliveryMode = 'source' | 'bundle';

export type PackageContract = {
  root: string;
  name: string;
  mode: DeliveryMode;
  sourceEntry: string;
  runtimeEntry: string;
  typesEntry?: string;
  demoEntry?: string;
};

export type VerifyOptions = {
  frozenDist?: boolean;
};

type VerifyCommandOptions = VerifyOptions & {
  all?: boolean;
};

function normalizeEntry(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function displayEntry(value: string): string {
  return `./${normalizeEntry(value)}`;
}

function rootExport(exportsField: PackageJson['exports']): unknown {
  if (typeof exportsField === 'string') return exportsField;
  if (!exportsField || typeof exportsField !== 'object') return undefined;
  return Object.hasOwn(exportsField, '.') ? exportsField['.'] : exportsField;
}

function exportCondition(exportsField: PackageJson['exports'], condition: string): string | undefined {
  const root = rootExport(exportsField);
  if (typeof root === 'string') return condition === 'default' ? root : undefined;
  if (!root || typeof root !== 'object') return undefined;
  const value = (root as Record<string, unknown>)[condition];
  return typeof value === 'string' ? value : undefined;
}

function isInsidePackage(entry: string): boolean {
  const normalized = normalizeEntry(entry);
  return normalized.length > 0 && normalized !== '..' && !normalized.startsWith('../') && !normalized.includes('/../');
}

function isIncluded(files: string[], entry: string): boolean {
  const target = normalizeEntry(entry);
  return files.some((candidate) => {
    const included = normalizeEntry(candidate);
    return target === included || target.startsWith(`${included}/`);
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function packagePath(root: string, entry: string): string {
  const resolved = resolve(root, normalizeEntry(entry));
  const rootPrefix = `${resolve(root)}${sep}`;
  if (!resolved.startsWith(rootPrefix)) {
    throw new Error(`Entry escapes the package root: ${entry}`);
  }
  return resolved;
}

export async function inspectPackage(directory = '.'): Promise<PackageContract> {
  const root = resolve(directory);
  const manifestPath = resolve(root, 'package.json');
  const pkg = JSON.parse(await readFile(manifestPath, 'utf8')) as PackageJson;
  const issues: string[] = [];

  const exportedSvelte = exportCondition(pkg.exports, 'svelte');
  const exportedDefault = exportCondition(pkg.exports, 'default');
  const exportedTypes = exportCondition(pkg.exports, 'types');
  const sourceEntry = exportedSvelte ?? pkg.svelte ??
    ([exportedDefault, pkg.main].find((entry) => entry?.replace(/^\.\//, '').startsWith('src/')));
  const runtimeEntry = exportedDefault ?? pkg.main ?? sourceEntry;

  if (pkg.wornpage?.contractVersion !== DELIVERY_CONTRACT_VERSION) {
    issues.push(`Declare package.json#wornpage.contractVersion as ${DELIVERY_CONTRACT_VERSION}.`);
  }
  const deliveryDeclaration: DeliveryDeclaration | undefined = pkg.wornpage?.delivery === 'source'
    ? 'source'
    : pkg.wornpage?.delivery === 'browser-bundle'
      ? 'browser-bundle'
      : undefined;
  const declaredMode: DeliveryMode | undefined = deliveryDeclaration === 'source'
    ? 'source'
    : deliveryDeclaration === 'browser-bundle'
      ? 'bundle'
      : undefined;
  if (!declaredMode) {
    issues.push('Declare package.json#wornpage.delivery as "source" or "browser-bundle".');
  }

  const attributesPath = resolve(root, '.gitattributes');
  if (!(await exists(attributesPath))) {
    issues.push('Add .gitattributes so component text is checked out with deterministic LF endings.');
  } else {
    const attributes = (await readFile(attributesPath, 'utf8')).replaceAll('\r\n', '\n');
    if (!attributes.split('\n').includes(DELIVERY_GIT_ATTRIBUTES.trim())) {
      issues.push(`.gitattributes must include "${DELIVERY_GIT_ATTRIBUTES.trim()}".`);
    }
  }

  const readmePath = resolve(root, 'README.md');
  if (!(await exists(readmePath))) {
    issues.push('Add README.md with the component delivery section.');
  } else if (deliveryDeclaration) {
    const readme = await readFile(readmePath, 'utf8');
    const expectedSection = renderDeliveryReadmeSection(deliveryDeclaration);
    if (!readme.includes(expectedSection)) {
      issues.push(`README.md must include the v${DELIVERY_CONTRACT_VERSION} ${deliveryDeclaration} delivery section.`);
    }
  }

  const workflowPath = resolve(root, '.github', 'workflows', 'release-contract.yml');
  if (!(await exists(workflowPath))) {
    issues.push('Add .github/workflows/release-contract.yml to enforce this contract on pushes and pull requests.');
  } else {
    const workflow = (await readFile(workflowPath, 'utf8')).replaceAll('\r\n', '\n');
    if (!workflow.includes(`uses: ${DELIVERY_WORKFLOW_REFERENCE}`)) {
      issues.push(`The release workflow must call ${DELIVERY_WORKFLOW_REFERENCE}.`);
    }
    if (!/^\s{2}push:\s*$/mu.test(workflow) || !/^\s{2}pull_request:\s*$/mu.test(workflow)) {
      issues.push('The release workflow must run on both push and pull_request.');
    }
  }

  if (!sourceEntry) issues.push('Declare the canonical source entry with exports["."].svelte or package.json#svelte.');
  if (!runtimeEntry) issues.push('Declare the consumer runtime entry with exports["."].default or package.json#main.');

  for (const [label, entry] of [
    ['source', sourceEntry],
    ['runtime', runtimeEntry],
    ['types', exportedTypes],
  ] as const) {
    if (entry && !isInsidePackage(entry)) issues.push(`The ${label} entry must stay inside the package: ${entry}`);
  }

  if (sourceEntry && !normalizeEntry(sourceEntry).startsWith('src/')) {
    issues.push(`The canonical source entry must be under src/: ${sourceEntry}`);
  }

  const runtimePath = runtimeEntry ? normalizeEntry(runtimeEntry) : '';
  const runtimeMode: DeliveryMode = runtimePath.startsWith('dist/') ? 'bundle' : 'source';
  if (declaredMode && declaredMode !== runtimeMode) {
    const declaredDelivery = declaredMode === 'bundle' ? 'browser-bundle' : 'source';
    issues.push(`package.json#wornpage.delivery declares ${declaredDelivery}, but the runtime entry is ${runtimeEntry}.`);
  }
  const mode = declaredMode ?? runtimeMode;
  if (runtimePath && !runtimePath.startsWith('src/') && !runtimePath.startsWith('dist/')) {
    issues.push(`The runtime entry must be under src/ or dist/: ${runtimeEntry}`);
  }

  if (pkg.svelte && exportedSvelte && normalizeEntry(pkg.svelte) !== normalizeEntry(exportedSvelte)) {
    issues.push(`package.json#svelte and exports["."].svelte disagree (${pkg.svelte} vs ${exportedSvelte}).`);
  }
  if (pkg.main && exportedDefault && normalizeEntry(pkg.main) !== normalizeEntry(exportedDefault)) {
    issues.push(`package.json#main and exports["."].default disagree (${pkg.main} vs ${exportedDefault}).`);
  }

  if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
    issues.push('Declare package.json#files so the published surface is explicit.');
  } else {
    if (sourceEntry && !isIncluded(pkg.files, sourceEntry)) {
      issues.push(`package.json#files does not include the source entry ${displayEntry(sourceEntry)}.`);
    }
    if (runtimeEntry && !isIncluded(pkg.files, runtimeEntry)) {
      issues.push(`package.json#files does not include the runtime entry ${displayEntry(runtimeEntry)}.`);
    }
    if (exportedTypes && !isIncluded(pkg.files, exportedTypes)) {
      issues.push(`package.json#files does not include the types entry ${displayEntry(exportedTypes)}.`);
    }
    if (mode === 'source' && pkg.files.some((entry) => normalizeEntry(entry) === 'dist')) {
      issues.push('Source-only packages must not advertise dist/ in package.json#files.');
    }
  }

  if (!pkg.scripts?.test) issues.push('Declare a package.json#scripts.test command.');
  if (mode === 'bundle' && !pkg.scripts?.build) {
    issues.push('Bundled packages must declare package.json#scripts.build.');
  }

  const distPath = resolve(root, 'dist');
  if (mode === 'source' && await exists(distPath)) {
    issues.push('Source-only packages must not contain a dist/ directory.');
  }

  if (sourceEntry && !(await exists(packagePath(root, sourceEntry)))) {
    issues.push(`The source entry does not exist: ${displayEntry(sourceEntry)}.`);
  }
  if (exportedTypes && !(await exists(packagePath(root, exportedTypes)))) {
    issues.push(`The types entry does not exist: ${displayEntry(exportedTypes)}.`);
  }

  let demoEntry: string | undefined;
  const demoPath = resolve(root, 'index.html');
  if (await exists(demoPath)) {
    demoEntry = './index.html';
    if (mode === 'bundle' && runtimeEntry) {
      const html = (await readFile(demoPath, 'utf8')).replaceAll('\\', '/');
      if (!html.includes(displayEntry(runtimeEntry))) {
        issues.push(`index.html must load the declared browser bundle ${displayEntry(runtimeEntry)}.`);
      }
    }
  } else if (mode === 'bundle') {
    issues.push('Browser-bundle packages must include an index.html that loads the declared bundle.');
  }

  if (issues.length > 0) {
    throw new Error(`Release contract failed for ${pkg.name ?? root}:\n- ${issues.join('\n- ')}`);
  }

  return {
    root,
    name: pkg.name ?? '(unnamed package)',
    mode,
    sourceEntry: displayEntry(sourceEntry!),
    runtimeEntry: displayEntry(runtimeEntry!),
    typesEntry: exportedTypes ? displayEntry(exportedTypes) : undefined,
    demoEntry,
  };
}

async function run(command: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(command, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    const detail = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    throw new Error(`Command failed (${command.join(' ')}):${detail ? `\n${detail}` : ''}`);
  }
  return stdout;
}

async function snapshotDirectory(directory: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  if (!(await exists(directory))) return snapshot;

  async function visit(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        const key = relative(directory, path).replaceAll('\\', '/');
        const bytes = await Bun.file(path).arrayBuffer();
        snapshot.set(key, createHash('sha256').update(new Uint8Array(bytes)).digest('hex'));
      }
    }
  }

  await visit(directory);
  return snapshot;
}

function changedFiles(before: Map<string, string>, after: Map<string, string>): string[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path)).sort();
}

async function packedFiles(root: string): Promise<Set<string>> {
  const output = await run(['npm', 'pack', '--dry-run', '--json', '--ignore-scripts'], root);
  let result: Array<{ files?: Array<{ path?: string }> }>;
  try {
    result = JSON.parse(output);
  } catch {
    throw new Error(`npm pack returned invalid JSON:\n${output.trim()}`);
  }
  return new Set((result[0]?.files ?? []).flatMap((file) => file.path ? [normalizeEntry(file.path)] : []));
}

export async function verifyPackage(directory = '.', options: VerifyOptions = {}): Promise<PackageContract> {
  const contract = await inspectPackage(directory);
  await run(['bun', 'run', 'test'], contract.root);

  if (contract.mode === 'bundle') {
    const distPath = resolve(contract.root, 'dist');
    const before = options.frozenDist ? await snapshotDirectory(distPath) : undefined;
    await run(['bun', 'run', 'build'], contract.root);

    if (!(await exists(packagePath(contract.root, contract.runtimeEntry)))) {
      throw new Error(`Build did not create the runtime entry ${contract.runtimeEntry}.`);
    }

    if (before) {
      const changed = changedFiles(before, await snapshotDirectory(distPath));
      if (changed.length > 0) {
        throw new Error(`dist/ is stale. Rebuild and commit these generated files:\n- ${changed.join('\n- ')}`);
      }
    }
  } else if (!(await exists(packagePath(contract.root, contract.runtimeEntry)))) {
    throw new Error(`The runtime entry does not exist: ${contract.runtimeEntry}.`);
  }

  const packed = await packedFiles(contract.root);
  for (const [label, entry] of [
    ['source', contract.sourceEntry],
    ['runtime', contract.runtimeEntry],
    ['types', contract.typesEntry],
  ] as const) {
    if (entry && !packed.has(normalizeEntry(entry))) {
      throw new Error(`npm pack omitted the ${label} entry ${entry}.`);
    }
  }

  return contract;
}

function printContract(contract: PackageContract, options: VerifyOptions) {
  console.log(`\nVerified ${contract.name}`);
  console.log(`  contract: v${DELIVERY_CONTRACT_VERSION}`);
  console.log(`  delivery: ${contract.mode === 'bundle' ? 'source + generated browser bundle' : 'source only'}`);
  console.log(`  source:   ${contract.sourceEntry}`);
  console.log(`  runtime:  ${contract.runtimeEntry}`);
  console.log('  tests:    passed');
  if (contract.mode === 'bundle') {
    console.log(options.frozenDist ? '  dist:     current after rebuild' : '  build:    completed');
  }
  console.log('  package:  entries included\n');
}

export async function findComponentPackages(directory: string): Promise<string[]> {
  const root = resolve(directory);
  const packages: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const packageRoot = resolve(root, entry.name);
    const manifestPath = resolve(packageRoot, 'package.json');
    if (!(await exists(manifestPath))) continue;

    const pkg = JSON.parse(await readFile(manifestPath, 'utf8')) as PackageJson;
    const isStandalonePackage = pkg.name?.startsWith('@wornpage/') && !pkg.bin && !pkg.workspaces;
    if (isStandalonePackage) packages.push(packageRoot);
  }
  return packages.sort((a, b) => a.localeCompare(b));
}

export async function verifyWorkspace(directory: string, options: VerifyOptions = {}): Promise<PackageContract[]> {
  const roots = await findComponentPackages(directory);
  if (roots.length === 0) throw new Error(`No standalone @wornpage packages found under ${resolve(directory)}.`);

  const contracts: PackageContract[] = [];
  const failures: string[] = [];
  for (const root of roots) {
    try {
      contracts.push(await verifyPackage(root, options));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${relative(resolve(directory), root)}:\n${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Workspace release contract failed (${failures.length}/${roots.length} packages):\n\n${failures.join('\n\n')}`);
  }
  return contracts;
}

export default async function verifyCommand(directory = '.', options: VerifyCommandOptions = {}) {
  if (options.all) {
    const contracts = await verifyWorkspace(directory, options);
    for (const contract of contracts) printContract(contract, options);
    console.log(`Verified ${contracts.length} standalone packages.`);
    return;
  }

  printContract(await verifyPackage(directory, options), options);
}
