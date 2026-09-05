import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const PROBE_TYPE = "lite-test-reload-probe";
const START_TYPE = "lite-test-reload-start";

function writeGraph(moduleDir, phase, extension) {
  const helperPath = path.join(moduleDir, `reload-helper.${extension}`);
  const middlePath = path.join(moduleDir, `reload-middle.${extension}`);

  if (extension === "mjs") {
    writeFileSync(helperPath, [
      `export const marker = ${JSON.stringify(phase)};`,
      "export function legacyHelper() { return `legacy-${marker.toLowerCase()}`; }",
      "",
    ].join("\n"));
    writeFileSync(middlePath, [
      'import { legacyHelper, marker } from "./reload-helper.mjs";',
      "export function readProbe() {",
      '  return { marker, legacyHelperType: typeof legacyHelper, legacyHelperValue: legacyHelper() };',
      "}",
      "",
    ].join("\n"));
    return;
  }

  writeFileSync(helperPath, [
    `export const marker = ${JSON.stringify(phase)};`,
    "export function newHelper() { return `new-${marker.toLowerCase()}`; }",
    "export function helperVersion() { return `version-${marker.toLowerCase()}`; }",
    "",
  ].join("\n"));
  writeFileSync(middlePath, [
    'import { helperVersion, marker, newHelper } from "./reload-helper.ts";',
    "export function readProbe() {",
    "  return {",
    "    marker,",
    "    newHelperType: typeof newHelper,",
    "    helperVersionType: typeof helperVersion,",
    "    newHelperValue: newHelper(),",
    "    helperVersionValue: helperVersion(),",
    "  };",
    "}",
    "",
  ].join("\n"));
}

function writeExtension(extensionDir, phase, extension) {
  writeFileSync(path.join(extensionDir, "lite-test-reload.ts"), [
    `import { readProbe } from "../reload-fixture-modules/reload-middle.${extension}";`,
    `const phase = ${JSON.stringify(phase)};`,
    "export default function (pi) {",
    '  pi.registerCommand("lite-test-reload", {',
    '    description: "Reload the synthetic runtime fixture",',
    "    handler: async (_args, ctx) => {",
    "      await ctx.reload();",
    "      return;",
    "    },",
    "  });",
    '  pi.registerCommand("lite-test-reload-probe", {',
    '    description: "Record the synthetic runtime fixture version",',
    "    handler: async () => {",
    `      pi.appendEntry(${JSON.stringify(PROBE_TYPE)}, { phase, ...readProbe() });`,
    "    },",
    "  });",
    '  pi.on("session_start", (event) => {',
    `    pi.appendEntry(${JSON.stringify(START_TYPE)}, { phase, reason: event.reason });`,
    "  });",
    "}",
    "",
  ].join("\n"));
}

function latestEntry(entries, customType) {
  return [...entries].reverse().find(entry => entry.type === "custom" && entry.customType === customType)?.data;
}

async function invokeCommand(rpc, command) {
  await rpc.request("prompt", { message: command });
}

async function assertProbe(rpc, phase, expected) {
  await invokeCommand(rpc, "/lite-test-reload-probe");
  const probe = latestEntry(await rpc.entries(), PROBE_TYPE);
  assert.ok(probe, `Reload probe ${phase} did not append an entry`);
  assert.equal(probe.phase, phase);
  assert.equal(probe.marker, phase);
  for (const [key, value] of Object.entries(expected)) assert.equal(probe[key], value, `${phase} ${key}`);
}

function assertNoLoadErrors(rpc, eventStart, stderrStart) {
  const extensionErrors = rpc.events.slice(eventStart).filter(event => event.type === "extension_error");
  assert.deepEqual(extensionErrors, [], `Reload fixture emitted extension errors: ${JSON.stringify(extensionErrors)}`);
  const stderr = rpc.stderr.slice(stderrStart);
  assert.doesNotMatch(stderr, /Failed to load extension|reload-(?:helper|middle)\.[mt]s|lite-test-reload\.ts/iu, `Reload fixture emitted loader diagnostics:\n${stderr}`);
}

export function prepareReloadFixture(agentDir) {
  const extensionDir = path.join(agentDir, "extensions");
  const moduleDir = path.join(agentDir, "reload-fixture-modules");
  mkdirSync(extensionDir, { recursive: true });
  mkdirSync(moduleDir, { recursive: true });
  writeGraph(moduleDir, "A", "mjs");
  writeExtension(extensionDir, "A", "mjs");

  return async function verifyReload(rpc) {
    const eventStart = rpc.events.length;
    const stderrStart = rpc.stderr.length;
    await assertProbe(rpc, "A", {
      legacyHelperType: "function",
      legacyHelperValue: "legacy-a",
    });

    writeGraph(moduleDir, "B", "ts");
    writeExtension(extensionDir, "B", "ts");
    await invokeCommand(rpc, "/lite-test-reload");
    assert.deepEqual(latestEntry(await rpc.entries(), START_TYPE), { phase: "B", reason: "reload" });
    await assertProbe(rpc, "B", {
      newHelperType: "function",
      helperVersionType: "function",
      newHelperValue: "new-b",
      helperVersionValue: "version-b",
    });

    writeGraph(moduleDir, "C", "ts");
    writeExtension(extensionDir, "C", "ts");
    await invokeCommand(rpc, "/lite-test-reload");
    assert.deepEqual(latestEntry(await rpc.entries(), START_TYPE), { phase: "C", reason: "reload" });
    await assertProbe(rpc, "C", {
      newHelperType: "function",
      helperVersionType: "function",
      newHelperValue: "new-c",
      helperVersionValue: "version-c",
    });

    assertNoLoadErrors(rpc, eventStart, stderrStart);
  };
}
