import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const filename of ["session-keys.test.ps1", "install-session-commands.test.ps1"]) {
  test(`Windows session-key fixture: ${filename}`, { skip: process.platform !== "win32" }, () => {
    const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "tests", filename)], {
      encoding: "utf8", timeout: 120_000, windowsHide: true,
    });
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /RESULT passed=\d+ failed=0/);
  });
}

test("distributed session scripts are BOM-safe and explicitly allowlisted", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  for (const filename of ["Session-Keys.psm1", "Install-Session-Commands.ps1"]) {
    const relative = `scripts/${filename}`;
    assert.ok(manifest.files.includes(relative));
    const contents = readFileSync(path.join(root, relative));
    assert.deepEqual([...contents.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.doesNotMatch(contents.toString("utf8"), /(?:setx|Export-Clixml|ConvertFrom-SecureString)\b/i);
  }
});
