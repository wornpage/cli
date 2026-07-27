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
  .command('ship')
  .description('Build, bump version, and publish')
  .action(async () => {
    const { default: shipCmd } = await import('./commands/ship.ts');
    await shipCmd();
  });

program.parse();
