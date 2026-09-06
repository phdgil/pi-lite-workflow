import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  matchesWorkflowWorkspace,
  readWorkflowArtifact,
  recoverWorkflow,
  renderResearchArtifact,
  reservedWorkflowArtifact,
  researchMaterialDigest,
  researchValidationContext,
  startWorkflow,
  validatePlanAlignment,
  validateResearchContract,
  WORKFLOW_STATE,
  WORKFLOW_VERSION,
  workflowContract,
} from "./workflow.ts";
import { finishInterview, INTERVIEW_CLOSURE_STATE, recoverInterview } from "./interview.ts";
import { digest } from "./loop.ts";

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

function researchReceipt(content = "Primary evidence content") {
  return {
    id: "RECEIPT1",
    pass: 1,
    kind: "read",
    status: "ok",
    results: [{ url: "https://example.com/source", title: "Primary source", content }],
  };
}

function researchContract(overrides = {}) {
  return {
    version: 2,
    mode: "initial",
    outcome: "ready",
    claims: [{ id: "CLAIM1", kind: "evidence", text: "The primary source supports the bounded claim.", sourceIds: ["SOURCE1"] }],
    sources: [{ id: "SOURCE1", url: "https://example.com/source", title: "Primary source", receiptIds: ["RECEIPT1"], limitation: "One source cannot establish every implementation detail." }],
    learnedClaimIds: ["CLAIM1"],
    remainingGap: "No material research gap remains for the next interview question.",
    ...overrides,
  };
}

function validationContext(overrides = {}) {
  return { mode: "initial", receipts: [researchReceipt()], currentArtifactRevision: null, diskArtifactRevision: null, ...overrides };
}

function validatedInput(contract = researchContract(), context = validationContext(), expectedArtifactRevision = null) {
  return validateResearchContract({ contract, expectedArtifactRevision }, context);
}

test("the original request and typed research remain distinct inputs to the interview", () => {
  const current = startWorkflow("research", "Help users choose an analysis method.", process.cwd());
  const submission = validatedInput();
  const next = { ...current, stage: "interview", research: { path: "research.md", text: renderResearchArtifact(current.originalTask, submission), contract: submission.contract, revision: digest(renderResearchArtifact(current.originalTask, submission)) } };
  const recovered = recoverWorkflow([{ type: "custom", customType: WORKFLOW_STATE, data: next }]);
  assert.equal(recovered.originalTask, current.originalTask);
  assert.equal(recovered.research.contract.version, 2);
  assert.match(workflowContract(recovered), /not a replacement intention/);
  assert.match(workflowContract(recovered), /New IDs, URLs, hashes, scores/);
  assert.match(workflowContract(recovered), /User corrections override research/);
});

test("explicit research-only and plan-only boundaries disable their automatic handoffs", () => {
  assert.equal(startWorkflow("research", "Task --research-only", process.cwd()).autoInterview, false);
  assert.equal(startWorkflow("interview", "Task --plan-only", process.cwd()).autoExecute, false);
  assert.equal(startWorkflow("research", "Task", process.cwd()).autoExecute, true);
  for (const text of ["Do not implement.", "Planning only", "계획만 작성해줘"]) assert.equal(startWorkflow("research", text, process.cwd()).autoExecute, false);
});

test("unsupported active state versions pause without gaining execution authority", () => {
  const old = { id: "old", version: 2, stage: "execute", status: "active", approval: "old", snapshots: {} };
  const recovered = recoverWorkflow([{ type: "custom", customType: WORKFLOW_STATE, data: old }]);
  assert.equal(recovered.status, "paused");
  assert.equal(recovered.approval, undefined);
  assert.match(recovered.reason, new RegExp(`version ${WORKFLOW_VERSION}`));
});

test("stopped, paused, and planning-complete workflows do not inject an old goal", () => {
  const current = startWorkflow("execute", "Old task", process.cwd());
  for (const status of ["research_complete", "planning_complete", "stopped", "paused", "workspace_mismatch"]) assert.equal(workflowContract({ ...current, status }), "");
});

test("research V2 rejects research-only invalid submissions before any boundary advance", () => {
  const workflow = startWorkflow("research", "Collect evidence --research-only", process.cwd());
  assert.equal(workflow.autoInterview, false);
  assert.throws(() => validateResearchContract({ contract: { ...researchContract(), version: 1 }, expectedArtifactRevision: null }, validationContext()), /version 2/);
  assert.throws(() => validateResearchContract({ contract: { ...researchContract(), learnedClaimIds: ["MISSING"] }, expectedArtifactRevision: null }, validationContext()), /reference a submitted claim/);
  assert.throws(() => validateResearchContract({ contract: { ...researchContract(), claims: [{ id: "CLAIM1", kind: "evidence", text: "Unsupported memory claim", sourceIds: [] }] }, expectedArtifactRevision: null }, validationContext()), /receipted source/);
  assert.throws(() => validateResearchContract({ contract: researchContract(), expectedArtifactRevision: null }, validationContext({ receipts: [] })), /not a successful receipt/);
  assert.equal(workflow.stage, "research");
  assert.equal(workflow.status, "active");
});

test("research submissions fail closed on stale and unowned artifact revisions", () => {
  const current = digest("controller-owned research bytes");
  assert.throws(() => validateResearchContract({ contract: researchContract(), expectedArtifactRevision: null }, validationContext({ currentArtifactRevision: current, diskArtifactRevision: current })), /stale/);
  assert.throws(() => validateResearchContract({ contract: researchContract(), expectedArtifactRevision: null }, validationContext({ currentArtifactRevision: null, diskArtifactRevision: digest("user file") })), /unowned file/);
  assert.throws(() => validateResearchContract({ contract: researchContract(), expectedArtifactRevision: current }, validationContext({ currentArtifactRevision: current, diskArtifactRevision: digest("changed bytes") })), /controller and disk/);
});

test("detour lineage requires the matching gap, answer head, and material evidence", () => {
  const duplicate = researchContract({ mode: "detour", gapId: "GAP1", answerHeadId: "ANSWER1", nextQuestion: { text: "How should this evidence change the decision?", addressesGapId: "GAP1", rationale: "It targets the unresolved gap." } });
  const startEvidenceDigest = researchMaterialDigest(duplicate, [researchReceipt()]);
  const context = validationContext({ mode: "detour", gapId: "GAP1", answerHeadId: "ANSWER1", startEvidenceDigest });
  assert.throws(() => validatedInput({ ...duplicate, gapId: "OTHER" }, context), /lineage is stale/);
  assert.throws(() => validatedInput({ ...duplicate, answerHeadId: "OTHER" }, context), /lineage is stale/);
  assert.throws(() => validatedInput(duplicate, context), /only new identities or duplicate evidence/);

  const changed = researchContract({
    mode: "detour",
    gapId: "GAP1",
    answerHeadId: "ANSWER1",
    claims: [{ id: "CLAIM2", kind: "evidence", text: "New retrieved content narrows the exact gap.", sourceIds: ["SOURCE2"] }],
    sources: [{ id: "SOURCE2", url: "https://example.com/source", title: "Primary source", receiptIds: ["RECEIPT1"], limitation: "The source addresses only the named gap." }],
    learnedClaimIds: ["CLAIM2"],
    nextQuestion: { text: "Which narrowed option matches the intended outcome?", addressesGapId: "GAP1", rationale: "The new source content removes the earlier factual ambiguity." },
  });
  const changedContext = { ...context, receipts: [researchReceipt("Materially different retrieved content")] };
  assert.notEqual(validatedInput(changed, changedContext).materialDigest, startEvidenceDigest);
});

test("host rendering keeps typed claims, source lineage, limitations, and next question visible", () => {
  const submission = validatedInput();
  const rendered = renderResearchArtifact("Choose a supported method.", submission);
  assert.match(rendered, /^Status: complete$/m);
  assert.match(rendered, /Contract: ResearchContractV2/);
  assert.match(rendered, /CLAIM1/);
  assert.match(rendered, /RECEIPT1/);
  assert.match(rendered, /One source cannot establish/);
  assert.match(rendered, /## Contract JSON/);
});

test("research validation context binds the open detour and current-pass receipts", () => {
  const workflow = {
    researchPass: 2,
    research: { revision: digest("old") },
    webEvidence: [researchReceipt("old pass"), { ...researchReceipt("current pass"), id: "RECEIPT2", pass: 2 }],
    detours: [{ target: "research", gapId: "GAP9", answerHeadId: "ANSWER9", startEvidenceDigest: digest("start") }],
  };
  const context = researchValidationContext(workflow, digest("old"));
  assert.equal(context.mode, "detour");
  assert.equal(context.gapId, "GAP9");
  assert.equal(context.answerHeadId, "ANSWER9");
  assert.deepEqual(context.receipts.map(item => item.id), ["RECEIPT2"]);
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
  assert.equal(reservedWorkflowArtifact(workspace, current.id, "research").relativePath, `.solar-workflow/${current.id}/research.md`);
}));

test("handoffs require actual complete research or structurally ready plans", () => fixture(workspace => {
  writeFileSync(path.join(workspace, "research.md"), research);
  writeFileSync(path.join(workspace, "plan.md"), plan);
  assert.equal(readWorkflowArtifact(workspace, "research.md", "research").text, research);
  assert.equal(readWorkflowArtifact(workspace, "plan.md", "plan").text, plan);
  writeFileSync(path.join(workspace, "plan.md"), plan.replace("Status: ready", "Status: blocked"));
  assert.throws(() => readWorkflowArtifact(workspace, "plan.md", "plan"), /Status: ready/);
  writeFileSync(path.join(workspace, "plan.md"), plan.replace("All requested headings and evidence present.", ""));
  assert.throws(() => readWorkflowArtifact(workspace, "plan.md", "plan"), /nonempty Acceptance criteria/);
  writeFileSync(path.join(workspace, "plan.md"), plan.replace("1. Write", "Write"));
  assert.throws(() => readWorkflowArtifact(workspace, "plan.md", "plan"), /one to 40/);
}));

test("missing, outside-workspace, and incorrectly named artifacts cannot advance", () => fixture((workspace, root) => {
  assert.throws(() => readWorkflowArtifact(workspace, "plan.md", "plan"), /ENOENT/);
  writeFileSync(path.join(root, "plan.md"), plan);
  assert.throws(() => readWorkflowArtifact(workspace, "../plan.md", "plan"), /inside/);
  writeFileSync(path.join(workspace, "other.md"), plan);
  assert.throws(() => readWorkflowArtifact(workspace, "other.md", "plan"), /controller-owned plan.md/);
}));

test("plan handoff counts only real steps outside fenced examples", () => fixture(workspace => {
  const steps = Array.from({ length: 5 }, (_, index) => `**Step ${index + 1} — Produce a bounded output.**\n\n- Acceptance check: output exists.\n- Validation: read the output.`).join("\n\n");
  const formatted = plan.replace("1. Write result.md; verify its required headings by reading it.", `${steps}\n\n\`\`\`text\n1. This is syntax, not a step.\n\`\`\``);
  writeFileSync(path.join(workspace, "plan.md"), formatted);
  assert.equal(readWorkflowArtifact(workspace, "plan.md", "plan").text, formatted);
  writeFileSync(path.join(workspace, "plan.md"), plan.replace("1. Write result.md; verify its required headings by reading it.", Array.from({ length: 41 }, (_, index) => `**Step ${index + 1} — bounded output**`).join("\n")));
  assert.throws(() => readWorkflowArtifact(workspace, "plan.md", "plan"), /Found 41/);
}));

test("post-interview planning and execution messages never become interview answers", () => {
  const answers = [{ id: "original", text: "Original intention" }];
  const closure = finishInterview(undefined, answers, "original", "/solar-interview finish");
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
