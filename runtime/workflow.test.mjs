import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { matchesWorkflowWorkspace, readWorkflowArtifact, recoverWorkflow, startWorkflow, validatePlanAlignment, WORKFLOW_STATE, workflowContract } from "./workflow.ts";
import { finishInterview, INTERVIEW_CLOSURE_STATE, recoverInterview } from "./interview.ts";

const research = "# Research\nStatus: complete\n## Original intention\nHelp users decide, not build my preferred design.\n## Evidence\nLocal source: example.md.\n## Caveats and unknowns\nNo web search available.\n## Useful interview questions\nWhat decision should improve?\n";
const plan = "# Plan\nStatus: ready\n## Goal and scope\nWrite a local report.\n## Steps and validation\n1. Write result.md; verify its required headings by reading it.\n## Design review\nOne Markdown file is sufficient.\n## Risk review and revisions\nDo not edit source inputs.\n## Acceptance criteria\nAll requested headings and evidence present.\n## Remaining uncertainties\nThe detailed algorithm is deferred.\n";

function fixture(callback) {
  const base = realpathSync(os.tmpdir());
  const root = mkdtempSync(path.join(base, "lite-workflow-unit-"));
  try {
    const workspace = path.join(root, "workspace");
    mkdirSync(workspace);
    return callback(workspace, root);
  } finally {
    assert.equal(path.dirname(realpathSync(root)), base);
    assert.ok(path.basename(root).startsWith("lite-workflow-unit-"));
    rmSync(root, { recursive: true, force: true });
  }
}

test("the original request and research persist as distinct inputs to the interview", () => {
  const current = startWorkflow("research", "Help users choose an analysis method.", process.cwd());
  const next = { ...current, stage: "interview", research: { path: "research.md", text: research } };
  const recovered = recoverWorkflow([{ type: "custom", customType: WORKFLOW_STATE, data: next }]);
  assert.equal(recovered.originalTask, current.originalTask);
  assert.equal(recovered.research.text, research);
  assert.match(workflowContract(recovered), /not a replacement intention/);
  assert.match(workflowContract(recovered), /Do not tighten implementation details/);
  assert.match(workflowContract(recovered), /User corrections override research/);
});

test("explicit research-only and plan-only boundaries disable their automatic handoffs", () => {
  assert.equal(startWorkflow("research", "Task --research-only", process.cwd()).autoInterview, false);
  assert.equal(startWorkflow("interview", "Task --plan-only", process.cwd()).autoExecute, false);
  assert.equal(startWorkflow("research", "Task", process.cwd()).autoExecute, true);
  for (const text of ["Do not implement.", "Planning only", "계획만 작성해줘"]) assert.equal(startWorkflow("research", text, process.cwd()).autoExecute, false);
});

test("stopped and idle workflows do not inject an old goal into later requests", () => {
  const current = startWorkflow("execute", "Old task", process.cwd());
  for (const status of ["idle", "stopped", "paused", "workspace_mismatch"]) assert.equal(workflowContract({ ...current, status }), "");
});

test("plan handoff requires an alignment review and rejects declared interview conflicts", () => {
  assert.throws(() => validatePlanAlignment({}), /Review the plan/);
  assert.throws(() => validatePlanAlignment({ alignment: "Compared with the offline requirement.", conflicts: ["Plan requires cloud access despite the offline constraint."] }), /conflicts remain/);
  assert.deepEqual(validatePlanAlignment({ alignment: "Scope and offline success checks match the interview; algorithm remains deferred.", conflicts: [] }).conflicts, []);
});

test("workflow handoffs are bound to the canonical workspace", () => fixture((workspace, root) => {
  const current = startWorkflow("research", "Task", workspace);
  assert.equal(matchesWorkflowWorkspace(current, path.join(workspace, ".")), true);
  assert.equal(matchesWorkflowWorkspace(current, root), false);
}));

test("handoffs require actual complete research or reviewed executable plans", () => fixture(workspace => {
  writeFileSync(path.join(workspace, "research.md"), research);
  writeFileSync(path.join(workspace, "plan.md"), plan);
  assert.equal(readWorkflowArtifact(workspace, "research.md", "research").text, research);
  assert.equal(readWorkflowArtifact(workspace, "plan.md", "plan").text, plan);
  writeFileSync(path.join(workspace, "plan.md"), plan.replace("Status: ready", "Status: blocked"));
  assert.throws(() => readWorkflowArtifact(workspace, "plan.md", "plan"), /Status: ready/);
  writeFileSync(path.join(workspace, "plan.md"), plan.replace("All requested headings and evidence present.", ""));
  assert.throws(() => readWorkflowArtifact(workspace, "plan.md", "plan"), /nonempty Acceptance criteria/);
  writeFileSync(path.join(workspace, "plan.md"), plan.replace("1. Write", "Write"));
  assert.throws(() => readWorkflowArtifact(workspace, "plan.md", "plan"), /one to five/);
}));

test("missing, outside-workspace, and incorrectly named artifacts cannot advance", () => fixture((workspace, root) => {
  assert.throws(() => readWorkflowArtifact(workspace, "plan.md", "plan"), /ENOENT/);
  writeFileSync(path.join(root, "plan.md"), plan);
  assert.throws(() => readWorkflowArtifact(workspace, "../plan.md", "plan"), /inside/);
  writeFileSync(path.join(workspace, "other.md"), plan);
  assert.throws(() => readWorkflowArtifact(workspace, "other.md", "plan"), /plan.md/);
}));

test("plan handoff accepts bold and heading-style numbered steps without counting checks", () => fixture(workspace => {
  for (const heading of ["**Step 1 — Write result.md.**", "### Step 1: Write result.md", "**1. Write result.md.**", "1) Write result.md", "- [ ] Write result.md"]) {
    const formatted = plan.replace("1. Write result.md; verify its required headings by reading it.", `${heading}\n\n- Acceptance check: required heading exists.\n- Validation: read result.md.`);
    writeFileSync(path.join(workspace, "plan.md"), formatted);
    assert.equal(readWorkflowArtifact(workspace, "plan.md", "plan").text, formatted, heading);
  }
}));

test("five bold steps are valid while six are rejected and fenced examples do not count", () => fixture(workspace => {
  const steps = Array.from({ length: 5 }, (_, index) => `**Step ${index + 1} — Produce a bounded output.**\n\n- Acceptance check: output exists.\n- Validation: read the output.`).join("\n\n");
  const formatted = plan.replace("1. Write result.md; verify its required headings by reading it.", `${steps}\n\n\`\`\`text\n1. This is a syntax example, not a step.\n\`\`\``);
  writeFileSync(path.join(workspace, "plan.md"), formatted);
  assert.equal(readWorkflowArtifact(workspace, "plan.md", "plan").text, formatted);
  writeFileSync(path.join(workspace, "plan.md"), formatted.replace("## Design review", "**Step 6 — Additional work.**\n## Design review"));
  assert.throws(() => readWorkflowArtifact(workspace, "plan.md", "plan"), /Found 6/);
}));

test("post-interview planning and execution messages never become interview answers", () => {
  const answers = [{ id: "original", text: "Original intention" }];
  const closure = finishInterview(undefined, answers, "original", "Enough details");
  const recovered = recoverInterview([
    { type: "message", id: "original", message: { role: "user", content: "/skill:lite-interview Original intention" } },
    { type: "custom", customType: INTERVIEW_CLOSURE_STATE, data: closure },
    { type: "message", id: "planning", message: { role: "user", content: "/skill:lite-plan Plan the requested work" } },
    { type: "message", id: "execution", message: { role: "user", content: "/skill:lite-execute Execute the plan" } },
  ]);
  assert.deepEqual(recovered.answers.map(answer => answer.id), ["original"]);
  assert.equal(recovered.closure.assessment, null);
  assert.equal(recovered.active, false);
});
