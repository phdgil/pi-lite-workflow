import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { matchesWorkflowWorkspace, readWorkflowArtifact, recoverWorkflow, startWorkflow, WORKFLOW_STATE, workflowContract } from "./workflow.ts";
import { finishInterview, INTERVIEW_CLOSURE_STATE, recoverInterview } from "./interview.ts";

const research = "# Research\nStatus: complete\n## Original intention\nHelp users decide, not build my preferred design.\n## Evidence\nLocal source: example.md.\n## Caveats and unknowns\nNo web search available.\n## Useful interview questions\nWhat decision should improve?\n";
const plan = "# Plan\nStatus: ready\n## Goal and scope\nWrite a local report.\n## Steps and validation\n1. Write result.md; verify its required headings by reading it.\n## Design review\nOne Markdown file is sufficient.\n## Risk review and revisions\nDo not edit source inputs.\n## Acceptance criteria\nAll requested headings and evidence present.\n## Remaining uncertainties\nThe detailed algorithm is deferred.\n";

function fixture(callback) {
  const base = realpathSync(os.tmpdir());
  const root = mkdtempSync(path.join(base, "solar-workflow-unit-"));
  try {
    const workspace = path.join(root, "workspace");
    mkdirSync(workspace);
    return callback(workspace, root);
  } finally {
    assert.equal(path.dirname(realpathSync(root)), base);
    assert.ok(path.basename(root).startsWith("solar-workflow-unit-"));
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

test("post-interview planning and execution messages never become interview answers", () => {
  const answers = [{ id: "original", text: "Original intention" }];
  const closure = finishInterview(undefined, answers, "original", "Enough details");
  const recovered = recoverInterview([
    { type: "message", id: "original", message: { role: "user", content: "/skill:solar-interview Original intention" } },
    { type: "custom", customType: INTERVIEW_CLOSURE_STATE, data: closure },
    { type: "message", id: "planning", message: { role: "user", content: "/skill:solar-plan Plan the requested work" } },
    { type: "message", id: "execution", message: { role: "user", content: "/skill:solar-execute Execute the plan" } },
  ]);
  assert.deepEqual(recovered.answers.map(answer => answer.id), ["original"]);
  assert.equal(recovered.closure.assessment, null);
  assert.equal(recovered.active, false);
});
