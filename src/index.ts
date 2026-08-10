#!/usr/bin/env bun
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('wornpage')
  .description('Create, build, and publish @wornpage Svelte 5 components')
  .version(pkg.version);

// Future commands will be loaded here
program
  .command('new <name>')
  .description('Scaffold a new @wornpage package')
  .action(async (name: string) => {
    const { default: newCmd } = await import('./commands/new.ts');
    await newCmd(name);
  });

program
  .command('verify [directory]')
  .description('Verify a component source, bundle, demo, and packed exports')
  .option('--frozen-dist', 'fail when the build changes committed dist files')
  .option('--all', 'verify every standalone @wornpage package directly under directory')
  .action(async (directory: string | undefined, options: { frozenDist?: boolean; all?: boolean }) => {
    const { default: verifyCmd } = await import('./commands/verify.ts');
    await verifyCmd(directory ?? '.', { frozenDist: options.frozenDist, all: options.all });
  });

program
  .command('ship')
  .description('Verify, bump version, and publish')
  .action(async () => {
    const { default: shipCmd } = await import('./commands/ship.ts');
    await shipCmd();
  });

program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
