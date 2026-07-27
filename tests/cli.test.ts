import { describe, it, expect } from "bun:test";
import { $ } from "bun";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "index.ts");
const TMP = join(import.meta.dir, "..", ".test-tmp");

describe("@wornpage/cli", () => {
  it("shows help text", async () => {
    const result = await $`bun run ${CLI} --help`.quiet();
    expect(result.stdout.toString()).toContain("wornpage");
    expect(result.stdout.toString()).toContain("new");
    expect(result.stdout.toString()).toContain("ship");
  });

  it("shows version", async () => {
    const result = await $`bun run ${CLI} --version`.quiet();
    expect(result.stdout.toString()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("scaffolds a new package with new command", async () => {
    const targetDir = join(TMP, "wornpage-testbox");
    if (existsSync(targetDir)) rmSync(targetDir, { recursive: true });
    mkdirSync(TMP, { recursive: true });

    const result = await $`bun run ${CLI} new testbox`.cwd(TMP).quiet();
    expect(result.exitCode).toBe(0);
    expect(existsSync(targetDir)).toBe(true);
    expect(existsSync(join(targetDir, "package.json"))).toBe(true);
    expect(existsSync(join(targetDir, "src", "WornTestbox.svelte"))).toBe(true);
    expect(existsSync(join(targetDir, "src", "index.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "tests", "test.ts"))).toBe(true);

    const pkg = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf-8"));
    expect(pkg.name).toBe("@wornpage/testbox");
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.peerDependencies.svelte).toBeDefined();

    rmSync(targetDir, { recursive: true });
  });

  it("package.json is valid", () => {
    const pkg = require("../package.json");
    expect(pkg.name).toBe("@wornpage/cli");
    expect(pkg.bin.wornpage).toBeDefined();
    expect(pkg.license).toBe("MIT");
  });
});