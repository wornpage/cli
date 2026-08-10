# @wornpage/cli

Shared release tooling for the standalone `@wornpage` component repositories.

## Component release contract

Every component has one canonical implementation: `src/`. A `dist/` directory is generated delivery output for components that also run directly in a browser. It is never a second implementation and must never be edited by hand.

| Delivery | Source exports | Runtime export | Published files | Required scripts |
| --- | --- | --- | --- | --- |
| Source only | `./src/...` | `./src/...` | `src` | `test` |
| Browser bundle | `./src/...` | `./dist/...` | `src`, `dist` | `test`, `build` |

`wornpage verify` enforces the same contract in every repository. It:

1. Checks that `main`, `svelte`, and root `exports` agree.
2. Checks that source, runtime, and type entries exist and are included by `files`.
3. Runs the component's own tests.
4. Rebuilds browser bundles from `src/` and checks the declared output.
5. Checks that a root `index.html`, when present, loads the declared bundle.
6. Runs `npm pack --dry-run` and proves the consumer entry points are actually published.

Use the frozen check in CI and before committing a release:

```sh
bunx @wornpage/cli verify --frozen-dist
```

From the staging parent, audit every standalone package with one command. Discovery includes scoped `@wornpage/*` package repositories and excludes CLI tooling and workspace mirrors:

```sh
wornpage verify C:/jkbSoft/wornpage-staging --all --frozen-dist
```

If that command reports stale files, run `bun run build`, review the generated `dist/` change, and commit it with the source change. Source-only packages do not carry an empty or speculative `dist/` directory.

`wornpage ship` runs the verifier before changing the version, creating a tag, pushing, or publishing. Component behavior tests remain package-specific; the verifier covers the shared source-to-release boundary they cannot prove individually.

## Commands

```sh
wornpage new <name>
wornpage verify [directory] [--frozen-dist] [--all]
wornpage ship
```
