import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function newCommand(name: string) {
  const targetDir = join(process.cwd(), `wornpage-${name}`);
  
  console.log(`\nCreating @wornpage/${name} in ${targetDir}\n`);
  
  await mkdir(join(targetDir, 'src'), { recursive: true });
  await mkdir(join(targetDir, 'tests'), { recursive: true });

  const Cap = capitalize(name);

  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      name: `@wornpage/${name}`,
      version: '0.1.0',
      description: `Svelte 5 ${name} component`,
      type: 'module',
      scripts: { test: 'bun test' },
      main: './src/index.ts',
      svelte: './src/index.ts',
      exports: {
        '.': { types: './src/index.ts', svelte: './src/index.ts', default: `./src/Worn${Cap}.svelte` }
      },
      peerDependencies: { svelte: '^5.0.0' },
      files: ['src/', 'dist/'],
      keywords: ['svelte', name, 'wornpage'],
      license: 'MIT'
    }, null, 2) + '\n',

    [`src/Worn${Cap}.svelte`]: `<script lang="ts">
  interface Props {
    // Add your props here
  }
  let {}: Props = $props();
</script>

<div class="worn-${name}">
  <slot />
</div>

<style>
  .worn-${name} {
    /* Component styles */
  }
</style>
`,

    'src/index.ts': `export { default as Worn${Cap} } from './Worn${Cap}.svelte';\n`,

    'tests/test.ts': `import { describe, it, expect } from 'bun:test';
import { mount } from 'svelte';
import Worn${Cap} from '../src/Worn${Cap}.svelte';

describe('Worn${Cap}', () => {
  it('renders without error', () => {
    const el = document.createElement('div');
    mount(Worn${Cap}, { target: el });
    expect(el.innerHTML).toBeTruthy();
  });
});
`,

    '.gitignore': 'node_modules/\ndist/*.map\n',
  };

  for (const [filepath, content] of Object.entries(files)) {
    await writeFile(join(targetDir, filepath), content);
    console.log(`  ✓ ${filepath}`);
  }

  console.log(`\nScaffolded ${Object.keys(files).length} files.\n`);
  console.log(`Next: cd wornpage-${name} && wornpage ship`);
}