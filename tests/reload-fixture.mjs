import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const PROBE_TYPE = "solar-test-reload-probe";
const START_TYPE = "solar-test-reload-start";

function writeGraph(moduleDir, phase, extension) {
  const helperPath = path.join(moduleDir, `reload-helper.${extension}`);
  const middlePath = path.join(moduleDir, `reload-middle.${extension}`);

  if (extension === "mjs") {
    writeFileSync(helperPath, [
      `export const marker = ${JSON.stringify(phase)};`,
      "export const interviewStateVersion = 2;",
      "export const workflowStateVersion = 3;",
      "export function legacyHelper() { return `legacy-${marker.toLowerCase()}`; }",
      "",
    ].join("\n"));
    writeFileSync(middlePath, [
      'import { interviewStateVersion, legacyHelper, marker, workflowStateVersion } from "./reload-helper.mjs";',
      "export function readProbe() {",
      "  return { marker, interviewStateVersion, workflowStateVersion, legacyHelperType: typeof legacyHelper, legacyHelperValue: legacyHelper() };",
      "}",
      "",
    ].join("\n"));
    return;
  }

  writeFileSync(helperPath, [
    `export const marker = ${JSON.stringify(phase)};`,
    "export const interviewStateVersion = 2;",
    "export const workflowStateVersion = 3;",
    "export function newHelper() { return `new-${marker.toLowerCase()}`; }",
    "export function helperVersion() { return `version-${marker.toLowerCase()}`; }",
    "",
  ].join("\n"));
  writeFileSync(middlePath, [
    'import { helperVersion, interviewStateVersion, marker, newHelper, workflowStateVersion } from "./reload-helper.ts";',
    "export function readProbe() {",
    "  return {",
    "    marker,",
    "    interviewStateVersion,",
    "    workflowStateVersion,",
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
  writeFileSync(path.join(extensionDir, "solar-test-reload.ts"), [
    `import { readProbe } from "../reload-fixture-modules/reload-middle.${extension}";`,
    `const phase = ${JSON.stringify(phase)};`,
    "export default function (pi) {",
    '  pi.registerCommand("solar-test-reload", {',
    '    description: "Reload the synthetic runtime fixture",',
    "    handler: async (_args, ctx) => {",
    "      await ctx.reload();",
    "      return;",
    "    },",
    "  });",
    '  pi.registerCommand("solar-test-reload-probe", {',
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
  await invokeCommand(rpc, "/solar-test-reload-probe");
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
  assert.doesNotMatch(stderr, /Failed to load extension|reload-(?:helper|middle)\.[mt]s|solar-test-reload\.ts/iu, `Reload fixture emitted loader diagnostics:\n${stderr}`);
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
      interviewStateVersion: 2,
      workflowStateVersion: 3,
      legacyHelperType: "function",
      legacyHelperValue: "legacy-a",
    });

    writeGraph(moduleDir, "B", "ts");
    writeExtension(extensionDir, "B", "ts");
    await invokeCommand(rpc, "/solar-test-reload");
    assert.deepEqual(latestEntry(await rpc.entries(), START_TYPE), { phase: "B", reason: "reload" });
    await assertProbe(rpc, "B", {
      interviewStateVersion: 2,
      workflowStateVersion: 3,
      newHelperType: "function",
      helperVersionType: "function",
      newHelperValue: "new-b",
      helperVersionValue: "version-b",
    });

    writeGraph(moduleDir, "C", "ts");
    writeExtension(extensionDir, "C", "ts");
    await invokeCommand(rpc, "/solar-test-reload");
    assert.deepEqual(latestEntry(await rpc.entries(), START_TYPE), { phase: "C", reason: "reload" });
    await assertProbe(rpc, "C", {
      interviewStateVersion: 2,
      workflowStateVersion: 3,
      newHelperType: "function",
      helperVersionType: "function",
      newHelperValue: "new-c",
      helperVersionValue: "version-c",
    });

    assertNoLoadErrors(rpc, eventStart, stderrStart);
  };
}
