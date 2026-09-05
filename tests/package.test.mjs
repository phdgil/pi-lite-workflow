import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const skills = ["solar-research", "solar-interview", "solar-plan", "solar-execute"];

test("release manifest loads four skills and exactly the shipped runtime", () => {
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.license, "MIT");
  assert.deepEqual(manifest.pi, { extensions: ["./runtime/extension.ts"], skills: ["./skills"] });
  for (const name of skills) {
    const text = readFileSync(path.join(root, "skills", name, "SKILL.md"), "utf8");
    assert.ok(text.startsWith(`---\nname: ${name}\n`));
    assert.match(text, /description: /);
  }
  assert.ok(existsSync(path.join(root, manifest.pi.extensions[0])));
});

test("host peers are not bundled and no install lifecycle runs", () => {
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.bundledDependencies, undefined);
  for (const name of ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"]) {
    assert.equal(manifest.peerDependencies[name], "*");
    assert.equal(manifest.peerDependenciesMeta[name].optional, true);
  }
  for (const hook of ["preinstall", "install", "postinstall", "prepare"]) assert.equal(manifest.scripts[hook], undefined);
  assert.ok(!manifest.files.some(entry => /upstream|controller|runs|\.pi|live_test|auth/i.test(entry)));
  assert.ok(manifest.files.every(entry => !entry.endsWith("/") && !entry.includes("*")), "Publication requires exact files, not recursive directory globs");
});

test("the shared Solar example contains no credential and preserves max mapping", () => {
  const example = JSON.parse(readFileSync(path.join(root, "examples/models.upstage.json"), "utf8"));
  const provider = example.providers.upstage;
  assert.equal(provider.apiKey, undefined);
  assert.equal(provider.baseUrl, "https://api.upstage.ai/v1");
  assert.equal(provider.compat.supportsReasoningEffort, true);
  assert.equal(provider.models[0].id, "solar-pro4");
  assert.equal(provider.models[0].thinkingLevelMap.max, "max");
});

test("public documentation links resolve and does not include local private paths", () => {
  for (const name of ["README.md", "THIRD_PARTY_NOTICES.md", "docs/INSTALL.md", "docs/WORKFLOW.md", "docs/REFERENCES.md", "docs/VALIDATION.md"]) {
    const filename = path.join(root, name);
    const text = readFileSync(filename, "utf8");
    assert.doesNotMatch(text, /C:\\Users\\user\\|OneDrive -|\.jsonl/);
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const destination = match[1].split("#")[0];
      if (!destination || /^[a-z]+:/i.test(destination)) continue;
      assert.ok(existsSync(path.resolve(path.dirname(filename), destination)), `${name}: broken link ${destination}`);
    }
  }
});
