import { describe, expect, it } from 'bun:test';

const publicDocs = [
  ['README.md', await Bun.file(new URL('../README.md', import.meta.url)).text()],
  [
    'docs/component-delivery.md',
    await Bun.file(new URL('../docs/component-delivery.md', import.meta.url)).text(),
  ],
] as const;

describe('public documentation', () => {
  it('uses an owner-neutral portfolio verification command', () => {
    for (const [name, text] of publicDocs) {
      expect(text, name).toContain('wornpage verify . --all --frozen-dist');
      expect(text, name).not.toMatch(/[A-Za-z]:[\\/]/);
      expect(text, name).not.toContain('jkbSoft');
    }
  });
});
