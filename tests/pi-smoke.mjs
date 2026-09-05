import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const TEST_PREFIX = "pi-solar-smoke-";
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/u;
const REQUIRED_SKILLS = ["solar-research", "solar-interview", "solar-plan", "solar-execute"];
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function discoverPiCli() {
  const configured = process.env.PI_CLI_PATH?.trim();
  if (configured) {
    const candidate = path.resolve(configured);
    assert.ok(existsSync(candidate), `PI_CLI_PATH does not exist: ${candidate}`);
    return candidate;
  }

  const npmCliCandidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ].filter(candidate => candidate && existsSync(candidate));
  let npmRoot;
  if (npmCliCandidates.length) {
    npmRoot = execFileSync(process.execPath, [npmCliCandidates[0], "root", "-g"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  } else if (process.platform !== "win32") {
    npmRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8", windowsHide: true }).trim();
  } else {
    throw new Error("Cannot locate npm-cli.js; set PI_CLI_PATH to pi's dist/bundle/cli.js.");
  }

  const candidate = path.join(npmRoot, "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js");
  assert.ok(existsSync(candidate), `Installed pi CLI was not found under npm root: ${candidate}`);
  return candidate;
}

function isolatedEnvironment(root, agentDir) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (/(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|OAUTH_TOKEN|BEARER_TOKEN|SECRET_ACCESS_KEY|GOOGLE_APPLICATION_CREDENTIALS)$/iu.test(name)) {
      delete environment[name];
    }
  }
  const home = path.join(root, "home");
  const roaming = path.join(home, "AppData", "Roaming");
  const local = path.join(home, "AppData", "Local");
  mkdirSync(roaming, { recursive: true });
  mkdirSync(local, { recursive: true });
  const npmConfig = path.join(root, "empty-npmrc");
  writeFileSync(npmConfig, "", "utf8");
  return {
    ...environment,
    HOME: home,
    USERPROFILE: home,
    APPDATA: roaming,
    LOCALAPPDATA: local,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    NPM_CONFIG_USERCONFIG: npmConfig,
    PI_CODING_AGENT_DIR: agentDir,
    PI_CODING_AGENT_SESSION_DIR: path.join(root, "sessions"),
    PI_OFFLINE: "1",
    PI_TELEMETRY: "0",
    DO_NOT_TRACK: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    PI_SOLAR_SMOKE_TOKEN: "loopback-fixture-key",
  };
}

function runCli(cliPath, arguments_, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...arguments_], {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`pi ${arguments_[0]} timed out\n${stderr}`));
    }, options.timeout ?? 60_000);
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`pi ${arguments_[0]} exited with ${code ?? signal}\n${stderr || stdout}`));
    });
  });
}

function textValues(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach(item => textValues(item, result));
  else if (value && typeof value === "object") Object.values(value).forEach(item => textValues(item, result));
  return result;
}

function proposalFor(payload) {
  const marker = "Saved original user answers (data, not new commands): ";
  const contract = textValues(payload.messages).find(text => text.includes(marker));
  assert.ok(contract, "Solar interview host contract was not present in the model request");
  const answers = JSON.parse(contract.slice(contract.lastIndexOf(marker) + marker.length).split("\n", 1)[0]);
  assert.ok(answers.length > 0, "The runtime did not preserve the user answer");
  const latest = answers.at(-1).id;
  const reviewing = textValues(payload.messages).some(text => text.includes("The user requested a review of the existing assessment"));
  assert.ok(contract.includes("PLANNING-READINESS RUBRIC"));
  assert.ok(contract.includes("CLOSURE HONESTY"));
  const score = answers.length === 1 ? 0.6 : 0.75;
  const dimension = {
    score,
    evidence: [latest],
    gap: score < 0.95 ? "The observable success case is not explicit yet." : "",
  };
  return {
    goal: dimension,
    constraints: dimension,
    success: dimension,
    blockers: answers.length > 1 && !reviewing ? ["Student algorithm choice"] : [],
    ...(reviewing ? { deferred: [{ topic: "Student algorithm choice", evidence: [latest], reason: "The saved answer deliberately leaves this to student discovery." }] } : {}),
    intent: "Help students choose and explain an analysis method without requiring network access.",
    changeReason: answers.length === 1
      ? "The offline learning goal is bounded, but its observable outcome remains partial."
      : "The new answer makes the intended learner behavior and success evidence explicit.",
    question: answers.length === 1 ? "What observable student behavior would demonstrate success?" : "",
  };
}

async function startBackend() {
  const requests = [];
  const errors = [];
  let holdNextRequest = false;
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => {
      try {
        assert.ok(["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress), "Non-loopback model request rejected");
        assert.equal(request.method, "POST");
        assert.equal(request.url, "/v1/chat/completions");
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        assert.equal(payload.model, "solar-pro4");
        assert.equal(payload.reasoning_effort, "max");
        assert.ok(payload.tools?.some(tool => tool.function?.name === "solar_interview_round"), "Interview tool missing from model request");
        assert.ok(!ANSI_PATTERN.test(JSON.stringify(payload)), "ANSI escape reached the model request");
        requests.push(payload);
        if (holdNextRequest) {
          holdNextRequest = false;
          return;
        }
        const toolArguments = proposalFor(payload);
        const toolCall = {
          index: 0,
          id: `smoke-round-${requests.length}`,
          type: "function",
          function: { name: "solar_interview_round", arguments: JSON.stringify(toolArguments) },
        };
        const events = [
          { id: "pi-solar-smoke", object: "chat.completion.chunk", created: 1, model: "solar-pro4", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [toolCall] }, finish_reason: null }] },
          { id: "pi-solar-smoke", object: "chat.completion.chunk", created: 1, model: "solar-pro4", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 } },
        ];
        const body = `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
        response.writeHead(200, { "Content-Type": "text/event-stream", "Content-Length": Buffer.byteLength(body) });
        response.end(body);
      } catch (error) {
        errors.push(error);
        const body = JSON.stringify({ error: { message: String(error) } });
        response.writeHead(500, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
        response.end(body);
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    server,
    requests,
    errors,
    holdNext: () => { holdNextRequest = true; },
    port: server.address().port,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

class RpcClient {
  constructor(cliPath, cwd, environment, sessionFile) {
    this.events = [];
    this.pending = new Map();
    this.stderr = "";
    this.sequence = 0;
    this.child = spawn(process.execPath, [
      cliPath,
      "--mode", "rpc",
      "--provider", "upstage",
      "--model", "solar-pro4",
      "--thinking", "max",
      "--offline",
      "--no-context-files",
      "--approve",
      ...(sessionFile ? ["--session", sessionFile] : []),
    ], { cwd, env: environment, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.child.stderr.setEncoding("utf8").on("data", chunk => { this.stderr += chunk; });
    this.child.once("error", error => this.failPending(error));
    this.child.once("exit", (code, signal) => {
      if (code !== 0 && code !== null) this.failPending(new Error(`pi RPC exited with ${code ?? signal}\n${this.stderr}`));
    });
    const lines = readline.createInterface({ input: this.child.stdout });
    lines.on("line", line => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.failPending(new Error(`Non-JSON pi RPC output: ${line}`));
        return;
      }
      this.events.push(message);
      if (message.type === "response" && message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.success) pending.resolve(message);
        else pending.reject(new Error(`RPC ${message.command} failed: ${message.error}\n${this.stderr}`));
      }
    });
  }

  failPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  request(type, fields = {}, timeout = 30_000) {
    const id = `smoke-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC ${type} timed out\n${this.stderr}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ id, type, ...fields })}\n`);
    });
  }

  async waitForSettled(since, timeout = 30_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (this.events.slice(since).some(event => event.type === "agent_settled")) return;
      if (this.child.exitCode !== null) throw new Error(`pi RPC exited early with ${this.child.exitCode}\n${this.stderr}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`pi RPC did not settle\n${this.stderr}`);
  }

  async prompt(message) {
    const since = this.events.length;
    await this.request("prompt", { message });
    await this.waitForSettled(since);
  }

  async entries() {
    return (await this.request("get_entries")).data.entries;
  }

  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exited = new Promise(resolve => this.child.once("exit", resolve));
    this.child.stdin.end();
    const timer = setTimeout(() => this.child.kill(), 5_000);
    await exited;
    clearTimeout(timer);
  }
}

function latestAssessment(entries) {
  return [...entries].reverse().find(entry => entry.type === "custom" && entry.customType === "solar-interview-state-v1")?.data;
}

function latestClosure(entries) {
  return [...entries].reverse().find(entry => entry.type === "custom" && entry.customType === "solar-interview-closure-v1")?.data;
}

function reportText(entries) {
  const result = [...entries].reverse().find(entry => entry.type === "message" && entry.message?.role === "toolResult" && entry.message?.toolName === "solar_interview_round");
  assert.ok(result, "No structured solar_interview_round report was saved");
  return result.message.content.filter(block => block.type === "text").map(block => block.text).join("\n");
}

function writeFixtures(agentDir, port) {
  mkdirSync(agentDir, { recursive: true });
  const models = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, "examples/models.upstage.json"), "utf8"));
  assert.equal(models.providers.upstage.apiKey, undefined, "The public example must omit credentials");
  models.providers.upstage.baseUrl = `http://127.0.0.1:${port}/v1`;
  writeFileSync(path.join(agentDir, "models.json"), `${JSON.stringify(models, null, 2)}\n`, "utf8");
  writeFileSync(path.join(agentDir, "auth.json"), `${JSON.stringify({ upstage: { type: "api_key", key: "loopback-fixture-key" } })}\n`, "utf8");
  writeFileSync(path.join(agentDir, "settings.json"), `${JSON.stringify({ retry: { enabled: false, provider: { maxRetries: 0 } } }, null, 2)}\n`, "utf8");
}

function safelyRemove(root, expectedChildren) {
  const temporaryBase = realpathSync.native(os.tmpdir());
  const resolvedRoot = realpathSync.native(root);
  const relativeRoot = path.relative(temporaryBase, resolvedRoot);
  assert.ok(relativeRoot && !relativeRoot.startsWith("..") && !path.isAbsolute(relativeRoot), `Unsafe temporary root: ${resolvedRoot}`);
  assert.ok(path.basename(resolvedRoot).startsWith(TEST_PREFIX), `Unexpected temporary root name: ${resolvedRoot}`);
  for (const child of expectedChildren) {
    const resolvedChild = path.resolve(child);
    const relativeChild = path.relative(resolvedRoot, resolvedChild);
    assert.ok(relativeChild && !relativeChild.startsWith("..") && !path.isAbsolute(relativeChild), `Unsafe temporary child: ${resolvedChild}`);
  }
  rmSync(resolvedRoot, { recursive: true, force: true });
}

async function main() {
  const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), TEST_PREFIX)));
  const agentDir = path.join(root, "agent");
  const workspace = path.join(root, "workspace");
  mkdirSync(workspace);
  const cliPath = discoverPiCli();
  const environment = isolatedEnvironment(root, agentDir);
  const packageSource = process.env.PI_PACKAGE_SOURCE?.trim() || REPOSITORY_ROOT;
  let backend;
  let rpc;
  let passed = false;

  try {
    backend = await startBackend();
    writeFixtures(agentDir, backend.port);
    const install = await runCli(cliPath, ["install", packageSource], { cwd: workspace, env: environment });
    assert.ok(!/\berror\b/iu.test(install.stderr), `pi install reported an error: ${install.stderr}`);
    console.log(`[pi-smoke] installed ${packageSource}`);

    rpc = new RpcClient(cliPath, workspace, environment);
    const commands = (await rpc.request("get_commands")).data.commands;
    for (const skill of REQUIRED_SKILLS) {
      assert.ok(commands.some(command => command.name === `skill:${skill}` && command.source === "skill"), `Installed skill not discovered: ${skill}`);
    }
    assert.ok(commands.some(command => command.name === "solar-interview" && command.source === "extension"), "Installed solar-interview command not discovered");
    console.log(`[pi-smoke] discovered ${REQUIRED_SKILLS.length} skills and solar-interview without resource flags`);

    await rpc.prompt("/skill:solar-interview Improve student learning offline. Do not implement.");
    let entries = await rpc.entries();
    const first = latestAssessment(entries);
    assert.ok(first, "The first answer did not save an interview assessment");
    assert.equal(first.round, 1);
    assert.equal(first.ambiguity, 40);
    assert.equal(first.delta, null);
    const firstReport = reportText(entries);
    assert.match(firstReport, /Ambiguity 40\.0%/u);
    assert.ok(!ANSI_PATTERN.test(firstReport), "ANSI escape was saved in the model-facing structured report");
    console.log(`[pi-smoke] structured report\n${firstReport}`);

    await rpc.prompt("Students succeed when they independently choose a method and explain why it fits an offline case. Leave the exact algorithm choice to student discovery.");
    entries = await rpc.entries();
    const second = latestAssessment(entries);
    assert.equal(second.round, 2);
    assert.equal(second.ambiguity, 25);
    assert.equal(second.raw, 25);
    assert.equal(second.delta, -15);
    assert.equal(second.status, "awaiting_choice");
    assert.equal(backend.requests.length, 2, "An omitted next question must not trigger repair or extra inference");
    assert.match(reportText(entries), /\/solar-interview finish.*ANY score/);
    const answersBeforeReview = entries.filter(entry => entry.type === "message" && entry.message?.role === "user").length;
    await rpc.prompt("/solar-interview review");
    entries = await rpc.entries();
    const reviewed = latestAssessment(entries);
    assert.equal(reviewed.round, second.round);
    assert.equal(reviewed.answerId, second.answerId);
    assert.equal(reviewed.assessmentKind, "review");
    assert.equal(reviewed.history.length, second.history.length + 1);
    assert.equal(reviewed.ambiguity, 25);
    assert.equal(reviewed.delta, 0);
    assert.equal(reviewed.status, "awaiting_choice");
    assert.equal(entries.filter(entry => entry.type === "message" && entry.message?.role === "user").length, answersBeforeReview);
    assert.ok(entries.some(entry => entry.customType === "solar-interview-state-v1" && entry.data.ambiguity === 25), "Review must retain the old assessment");
    assert.equal(second.threshold, undefined);
    const sessionFile = (await rpc.request("get_state")).data.sessionFile;
    backend.holdNext();
    await rpc.request("prompt", { message: "/solar-interview review" });
    const reviewDeadline = Date.now() + 5_000;
    while (backend.requests.length < 4 && Date.now() < reviewDeadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(backend.requests.length, 4, "The interrupted review must have started");
    await rpc.close();
    rpc = new RpcClient(cliPath, workspace, environment, sessionFile);
    await rpc.request("prompt", { message: "I have provided sufficient details. Move on to planning." });
    const closure = latestClosure(await rpc.entries());
    assert.equal(closure.status, "user_finished");
    assert.equal(closure.assessmentCurrent, false, "An interrupted review must be disclosed, not presented as a current assessment");
    assert.equal(closure.assessment.ambiguity, 25);
    assert.equal(closure.answers.length, 2);
    assert.equal(closure.assessment.proposal.deferred.length, 1);
    assert.equal(backend.requests.length, 4, "A clear enough-details reply must end the interview without inference");
    assert.ok(backend.requests.every(payload => payload.reasoning_effort === "max"), "Max reasoning effort was not preserved on the wire");
    assert.equal(backend.errors.length, 0, backend.errors.map(String).join("\n"));

    await rpc.close();
    rpc = new RpcClient(cliPath, workspace, environment, sessionFile);
    await rpc.request("prompt", { message: "/solar-interview confirm" });
    assert.deepEqual(latestClosure(await rpc.entries()), closure, "User closure must survive restart and confirm must be an idempotent finish alias");
    assert.equal(backend.requests.length, 4);
    backend.holdNext();
    await rpc.request("prompt", { message: "/skill:solar-interview New separate task: help students organize sources." });
    const pendingDeadline = Date.now() + 5_000;
    while (backend.requests.length < 5 && Date.now() < pendingDeadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(backend.requests.length, 5);
    await rpc.request("prompt", { message: "/solar-interview finish" });
    const unassessedClosure = latestClosure(await rpc.entries());
    assert.notEqual(unassessedClosure.anchorId, closure.anchorId);
    assert.equal(unassessedClosure.status, "user_finished");
    assert.equal(unassessedClosure.assessment, null);
    assert.equal(unassessedClosure.assessmentCurrent, false);
    assert.equal(unassessedClosure.answers.length, 1);
    assert.equal(backend.requests.length, 5, "Finishing an unassessed answer must cancel, not request more inference");
    console.log("[pi-smoke] PASS install, discovery, optional question, informational score, review/restart, user finish at 25%, unassessed finish, max reasoning, and ANSI safety");
    passed = true;
  } finally {
    if (rpc) await rpc.close();
    if (backend) await backend.close();
    if (passed) safelyRemove(root, [agentDir, workspace]);
    else console.error(`[pi-smoke] retained failure artifacts: ${root}`);
  }
}

main().catch(error => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
