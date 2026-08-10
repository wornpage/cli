import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { renderDeliveryReadmeSection, renderDeliveryWorkflow } from '../delivery.ts';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function newCommand(name: string) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error('Package name must be a lowercase slug such as button or command-menu.');
  }

  const targetDir = join(process.cwd(), `wornpage-${name}`);

  try {
    await mkdir(targetDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Target already exists: ${targetDir}`);
    }
    throw error;
  }

  console.log(`\nCreating @wornpage/${name} in ${targetDir}\n`);

  const Cap = capitalize(name);

  const files: Record<string, string> = {
    'README.md': `# @wornpage/${name}

Svelte 5 ${name} component.

${renderDeliveryReadmeSection('source')}

## Install

\`\`\`bash
bun add @wornpage/${name}
\`\`\`
`,

    'package.json': JSON.stringify({
      name: `@wornpage/${name}`,
      version: '0.1.0',
      description: `Svelte 5 ${name} component`,
      type: 'module',
      wornpage: { contractVersion: 1, delivery: 'source' },
      scripts: { test: 'bun test' },
      main: './src/index.ts',
      svelte: './src/index.ts',
      exports: {
        '.': { types: './src/index.ts', svelte: './src/index.ts', default: './src/index.ts' }
      },
      peerDependencies: { svelte: '^5.0.0' },
      devDependencies: { svelte: '^5.0.0' },
      files: ['src'],
      keywords: ['svelte', name, 'wornpage'],
      license: 'MIT'
    }, null, 2) + '\n',

    [`src/Worn${Cap}.svelte`]: `<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children?: Snippet;
  }
  let { children }: Props = $props();
</script>

<div class="worn-${name}">
  {@render children?.()}
</div>

<style>
  .worn-${name} {
    /* Component styles */
  }
</style>
`,

    'src/index.ts': `export { default as Worn${Cap} } from './Worn${Cap}.svelte';\n`,

    'tests/component.test.ts': `import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';

describe('Worn${Cap}', () => {
  it('compiles as a Svelte 5 component', () => {
    const source = readFileSync(new URL('../src/Worn${Cap}.svelte', import.meta.url), 'utf8');
    expect(() => compile(source, { generate: 'client', runes: true })).not.toThrow();
  });
});
`,

    '.github/workflows/release-contract.yml': renderDeliveryWorkflow(),

    '.gitignore': 'node_modules/\n',
  };

  for (const [filepath, content] of Object.entries(files)) {
    const target = join(targetDir, filepath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    console.log(`  ✓ ${filepath}`);
  }

  console.log('\nInstalling dependencies...');
  const install = Bun.spawn(['bun', 'install'], { cwd: targetDir, stdout: 'inherit', stderr: 'inherit' });
  if (await install.exited !== 0) throw new Error('Dependency installation failed.');

  console.log(`\nScaffolded ${Object.keys(files).length} files.\n`);
  console.log(`Next: cd wornpage-${name} && wornpage verify`);
}
