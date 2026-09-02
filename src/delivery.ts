export const DELIVERY_CONTRACT_VERSION = 2;
export const DELIVERY_CONTRACT_REVISION =
  '9a6a0e085d137c436842096c106c5a50100cc7b2';
export const DELIVERY_WORKFLOW_REFERENCE =
  `wornpage/cli/.github/workflows/component-release-contract.yml@${DELIVERY_CONTRACT_REVISION}`;
export const DELIVERY_GIT_ATTRIBUTES = '* text=auto eol=lf\n';

export type DeliveryDeclaration = 'source' | 'browser-bundle';

export function renderDeliveryWorkflow(): string {
  return `name: Release contract

on:
  push:
  pull_request:

jobs:
  release-contract:
    uses: ${DELIVERY_WORKFLOW_REFERENCE}
`;
}

export function renderDeliveryReadmeSection(delivery: DeliveryDeclaration): string {
  const description = delivery === 'browser-bundle'
    ? '`src/` is the canonical implementation and the Svelte consumer entry. `dist/` is a generated browser bundle; run `bun run build` after source changes and never edit `dist/` directly.'
    : '`src/` is the canonical implementation and published runtime. This package is source-only; it does not ship a generated `dist/` directory.';

  return [
    `<!-- wornpage-delivery:v${DELIVERY_CONTRACT_VERSION} ${delivery} -->`,
    '## Delivery',
    '',
    description,
    '',
    'Repository text is checked out as LF through `.gitattributes`, so generated output is byte-stable across Windows and Linux.',
    '',
    'The shared [component delivery contract](https://github.com/wornpage/cli/blob/master/docs/component-delivery.md) checks this declaration, package exports, packed files, and generated output on every push and pull request.',
    '<!-- /wornpage-delivery -->',
  ].join('\n');
}
