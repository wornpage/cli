# @wornpage/cli

Shared release tooling for the standalone `@wornpage` component repositories.

## Component release contract

Every component has one canonical implementation: `src/`. A `dist/` directory is generated delivery output for components that also run directly in a browser. It is never a second implementation and must never be edited by hand. The complete staging-to-app lifecycle is documented in [Component delivery](docs/component-delivery.md).

Each repository declares its mode in `package.json`; this is the local, machine-readable answer to whether that component should have `dist/`:

```json
{
  "wornpage": {
    "contractVersion": 2,
    "delivery": "source"
  }
}
```

`delivery` is either `source` or `browser-bundle`. The verifier rejects a missing declaration or any disagreement between it and the package entries.

Each component README also carries a short, versioned Delivery section generated from that declaration. It tells maintainers which tree to edit where they are most likely to look; the verifier rejects a missing or stale section. The `package.json` declaration remains the source of truth.

| Delivery | Source exports | Runtime export | Published files | Required scripts |
| --- | --- | --- | --- | --- |
| Source only | `./src/...` | `./src/...` | `src` | `test` |
| Browser bundle | `./src/...` | `./dist/...` | `src`, `dist` | `test`, `build` |

`wornpage verify` enforces the same contract in every repository. It:

1. Checks the versioned delivery declaration, deterministic `.gitattributes`, and matching local README section.
2. Rejects undeclared `dist/` behavior.
3. Checks that `main`, `svelte`, and root `exports` agree.
4. Checks that source, runtime, and type entries exist and are included by `files`.
5. Runs the component's own tests.
6. Rebuilds browser bundles from `src/` and checks the declared output.
7. Requires a root `index.html` for browser bundles and proves it loads the declared bundle.
8. Runs `npm pack --dry-run` and proves the consumer entry points are actually published.

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

## CI enforcement

Standalone repositories call `.github/workflows/component-release-contract.yml`
from this repository on every push and pull request. The reusable workflow owns
the Bun setup, frozen install, verifier checkout, and release check; component
repositories contain only the trigger below:

```yaml
jobs:
  release-contract:
    uses: wornpage/cli/.github/workflows/component-release-contract.yml@master
```

This keeps policy centralized while each repository remains independently
buildable and publishable.

## Commands

```sh
wornpage new <name>
wornpage verify [directory] [--frozen-dist] [--all]
wornpage ship
```

`wornpage new` creates a source-only Svelte package, installs its locked
development dependencies, and includes the shared release-contract caller, so
the generated repository can pass `wornpage verify` before its first commit.
Names must be lowercase slugs, and an existing target directory is never
overwritten.
