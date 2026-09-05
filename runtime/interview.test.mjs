import test from "node:test";
import assert from "node:assert/strict";
import { assessInterview, confirmInterview, finishInterview, isInterviewFinishRequest, recoverInterview, renderInterview, INTERVIEW_STATE, INTERVIEW_REVIEW_STATE, INTERVIEW_CLOSURE_STATE } from "./interview.ts";

const answers = [{ id: "answer-1", text: "Offline; success is independent reasoning." }];

test("legacy Solar sessions preserve answered questions and closure after the Lite rename", () => {
  const entries = [{ type: "message", id: "old-start", message: { role: "user", content: '<skill name="solar-interview">Old instructions</skill>\nOriginal intention.' } }];
  let recovered = recoverInterview(entries);
  assert.equal(recovered.active, true);
  assert.equal(recovered.anchorId, "old-start");
  assert.equal(recovered.answers[0].text, "Original intention.");
  const closure = finishInterview(undefined, recovered.answers, recovered.anchorId, "Enough.");
  recovered = recoverInterview([...entries, { type: "custom", customType: "solar-interview-closure-v1", data: closure }]);
  assert.equal(recovered.active, false);
  assert.deepEqual(recovered.closure, closure);
});
function proposal(score = 0.5) {
  const dimension = () => ({ score, evidence: ["answer-1"], gap: score < 1 ? "Meaning needs clarification" : "" });
  return { goal: dimension(), constraints: dimension(), success: dimension(), blockers: [], intent: "Improve independent reasoning offline.", changeReason: "The user defined the intended outcome.", question: "What observable behavior demonstrates independent reasoning?" };
}

test("every assessed round displays informational score, change, and user choice", () => {
  const first = assessInterview(proposal(), undefined, answers, "answer-1");
  const next = assessInterview(proposal(0.7), first, [...answers, { id: "answer-2", text: "A concrete example." }], "answer-1");
  assert.match(renderInterview(first), /50.0%.*no prior verified score.*informational only/);
  assert.match(renderInterview(first), /\/lite-interview finish.*ANY score/);
  assert.match(renderInterview(next), /30.0%.*-20.0 percentage points.*round 2/);
  assert.match(renderInterview(next, true), /모호성 30.0%/);
});

test("open issues do not replace raw ambiguity", () => {
  const input = proposal(0.35);
  input.blockers = ["Conflicting non-goal"];
  const state = assessInterview(input, undefined, answers, "answer-1");
  assert.equal(state.raw, 65);
  assert.equal(state.ambiguity, 65);
});

test("ambiguity may increase without an artificial blocker floor", () => {
  const first = assessInterview(proposal(0.99), undefined, answers, "answer-1");
  const input = proposal(0.8);
  input.blockers = ["New contradictory requirement"];
  const next = assessInterview(input, first, [...answers, { id: "answer-2", text: "Use the opposite approach." }], "answer-1");
  assert.equal(next.ambiguity, 20);
  assert.equal(next.delta, 19);
  assert.equal(confirmInterview(next).status, "confirmed");
  assert.deepEqual(confirmInterview(next).proposal.blockers, input.blockers);
});

test("no score automatically finishes or prevents user-directed closure", () => {
  for (const score of [0, 0.25, 0.9499, 0.951, 1]) {
    const state = assessInterview(proposal(score), undefined, answers, "answer-1");
    assert.equal(state.status, "interviewing");
    assert.equal(state.threshold, undefined);
    assert.equal(confirmInterview(state).status, "confirmed");
    assert.equal(finishInterview(state, answers, "answer-1", "Enough details").status, "user_finished");
  }
});

test("invalid evidence and repeated assessment cannot fabricate progress", () => {
  const invalid = proposal();
  invalid.goal.evidence = ["invented-answer"];
  assert.throws(() => assessInterview(invalid, undefined, answers, "answer-1"), /evidence/);
  const state = assessInterview(proposal(), undefined, answers, "answer-1");
  assert.throws(() => assessInterview(proposal(), state, answers, "answer-1"), /already/);
});

test("reload retains original answers and assessment without rewriting legacy brief", () => {
  const start = { type: "message", id: "answer-1", message: { role: "user", content: '<skill name="lite-interview">old instructions</skill> My real goal' } };
  const state = assessInterview(proposal(), undefined, answers, "answer-1");
  const entries = [start, { type: "custom", customType: INTERVIEW_STATE, data: state }];
  const recovered = recoverInterview(entries);
  assert.equal(recovered.active, true);
  assert.equal(recovered.answers[0].text, "My real goal");
  assert.deepEqual(recovered.state, state);
  entries.push({ type: "message", id: "answer-2", message: { role: "user", content: "/skill:lite-plan plan only" } });
  assert.equal(recoverInterview(entries).active, false);
});

test("legacy option answers retain the question and choices they answer", () => {
  const recovered = recoverInterview([
    { type: "message", id: "start", message: { role: "user", content: "/skill:lite-interview Clarify my intention" } },
    { type: "message", id: "question", message: { role: "assistant", content: "Choose A: independent reasoning; B: speed." } },
    { type: "message", id: "reply", message: { role: "user", content: "A" } },
  ]);
  assert.equal(recovered.answers[1].text, "A");
  assert.match(recovered.answers[1].question, /A: independent reasoning/);
});

test("a questionnaire cannot masquerade as one interview question", () => {
  for (const question of ["What subject? What age?", "1. Subject?\n2. Age?", "x".repeat(501)]) {
    assert.throws(() => assessInterview({ ...proposal(), question }, undefined, answers, "answer-1"), /ONE short question/);
  }
});

test("a new skill invocation starts a separate interview; resume retains the original", () => {
  const first = { type: "message", id: "old-start", message: { role: "user", content: "/skill:lite-interview First task" } };
  const old = assessInterview(proposal(0.99), undefined, answers, "old-start");
  const entries = [first, { type: "custom", customType: INTERVIEW_STATE, data: confirmInterview(old) }];
  const resumed = recoverInterview([...entries, { type: "message", id: "resume", message: { role: "user", content: "/skill:lite-interview Resume the interview" } }]);
  assert.equal(resumed.anchorId, "old-start");
  const fresh = recoverInterview([...entries, { type: "message", id: "new-start", message: { role: "user", content: "/skill:lite-interview A different task" } }]);
  assert.equal(fresh.anchorId, "new-start");
  assert.equal(fresh.state, undefined);
  assert.deepEqual(fresh.answers.map(answer => answer.id), ["new-start"]);
});

test("reference formatting is normalized only when an existing ID is unambiguous", () => {
  const input = proposal();
  input.goal.evidence = ["User said this (answer answer-1)"];
  const state = assessInterview(input, undefined, answers, "answer-1");
  assert.deepEqual(state.proposal.goal.evidence, ["answer-1"]);
  assert.deepEqual(input.goal.evidence, ["User said this (answer answer-1)"]);
  input.goal.evidence = ["unknown-ID"];
  assert.throws(() => assessInterview(input, undefined, answers, "answer-1"), /Available IDs/);
});

test("evidence-backed deferred implementation choices do not impose a blocker floor", () => {
  const input = proposal(0.99);
  input.deferred = [{ topic: "Exact algorithm and citation format", evidence: ["answer-1"], reason: "The user explicitly assigned these choices to the later student project." }];
  const state = assessInterview(input, undefined, answers, "answer-1");
  assert.equal(state.ambiguity, 1);
  assert.equal(state.status, "interviewing");
  assert.deepEqual(state.proposal.deferred, input.deferred);
  assert.throws(() => assessInterview({ ...input, blockers: [input.deferred[0].topic] }, undefined, answers, "answer-1"), /both.*deferred.*blocker/i);
  assert.throws(() => assessInterview({ ...input, deferred: [{ ...input.deferred[0], evidence: ["unknown"] }] }, undefined, answers, "answer-1"), /deferred.*evidence/i);
});

test("an explicit saved-answer review appends an audit revision without another answer", () => {
  const first = assessInterview({ ...proposal(0.9), blockers: ["Algorithm choice"] }, undefined, answers, "answer-1");
  const input = { ...proposal(0.99), deferred: [{ topic: "Algorithm choice", evidence: ["answer-1"], reason: "Explicitly left to planning by the user." }] };
  assert.throws(() => assessInterview(input, first, answers, "answer-1"), /already/);
  const reviewed = assessInterview(input, first, answers, "answer-1", { reassess: true });
  assert.equal(reviewed.round, first.round);
  assert.equal(reviewed.answerId, first.answerId);
  assert.equal(reviewed.history.length, first.history.length + 1);
  assert.equal(reviewed.history.at(-1).action, "review");
  assert.equal(reviewed.assessmentKind, "review");
  assert.equal(first.ambiguity, 10);
  assert.equal(reviewed.delta, -9);
  assert.match(renderInterview(reviewed), /saved.answer review/i);
});

test("open issues remain visible and preserved without preventing user closure", () => {
  const state = assessInterview({ ...proposal(0.99), blockers: ["Offline-only goal conflicts with mandatory cloud execution"] }, undefined, answers, "answer-1");
  assert.equal(state.ambiguity, 1);
  assert.deepEqual(finishInterview(state, answers, "answer-1", "finish").assessment.proposal.blockers, state.proposal.blockers);
  assert.doesNotMatch(renderInterview(state), /floor|<=5/);
  assert.match(renderInterview(state), /Offline-only goal/);
});

test("a missing next question is valid even with a high ambiguity score and open issues", () => {
  for (const question of [undefined, null, ""]) {
    const state = assessInterview({ ...proposal(0.5), question, blockers: ["An issue left for planning"] }, undefined, answers, "answer-1");
    assert.equal(state.status, "awaiting_choice");
    assert.equal(state.ambiguity, 50);
    assert.match(renderInterview(state), /\/lite-interview finish/);
  }
});

test("user closure preserves unassessed answers and cancels pending review across restart", () => {
  const first = assessInterview(proposal(0.5), undefined, answers, "answer-1");
  const latestAnswers = [...answers, { id: "answer-2", text: "Further details; the rest belongs to planning." }];
  const closure = finishInterview(first, latestAnswers, "answer-1", "Enough details");
  assert.equal(closure.assessmentCurrent, false);
  assert.deepEqual(closure.answers, latestAnswers);
  assert.deepEqual(closure.assessment, first);
  assert.equal(finishInterview(undefined, answers, "answer-1", "finish").assessment, null);
  const entries = [
    { type: "message", id: "answer-1", message: { role: "user", content: "/skill:lite-interview Start" } },
    { type: "custom", customType: INTERVIEW_STATE, data: first },
    { type: "custom", customType: INTERVIEW_REVIEW_STATE, data: { anchorId: "answer-1", answerId: "answer-1", status: "pending" } },
    { type: "custom", customType: INTERVIEW_CLOSURE_STATE, data: finishInterview(first, answers, "answer-1", "finish", true) },
  ];
  const recovered = recoverInterview(structuredClone(entries));
  assert.equal(recovered.active, false);
  assert.equal(recovered.reviewing, false);
  assert.equal(recovered.closure.assessmentCurrent, false);
});

test("clear direct finish replies are recognized, but hypothetical or quoted text is not", () => {
  for (const message of ["That's enough", "Stop the interview.", "I have provided sufficient details. Move on to planning.", "충분합니다.", "이 정도면 충분합니다. 계획으로 넘어가자"]) assert.equal(isInterviewFinishRequest(message), true, message);
  for (const message of ["What if I say enough details?", "Do not stop the interview.", "The document says 'stop the interview'.", "The student should decide when that is enough."]) assert.equal(isInterviewFinishRequest(message), false, message);
});

test("an unfinished saved-answer review survives restart and clears only on accepted review", () => {
  const first = assessInterview(proposal(0.99), undefined, answers, "answer-1");
  const entries = [
    { type: "message", id: "answer-1", message: { role: "user", content: "/skill:lite-interview Initial intention" } },
    { type: "custom", customType: INTERVIEW_STATE, data: first },
    { type: "custom", customType: INTERVIEW_REVIEW_STATE, data: { anchorId: "answer-1", answerId: "answer-1", status: "pending" } },
  ];
  assert.equal(recoverInterview(structuredClone(entries)).reviewing, true);
  assert.equal(recoverInterview([...entries, { type: "custom", customType: INTERVIEW_STATE, data: { ...first, status: "paused" } }]).reviewing, true);
  const review = assessInterview(proposal(0.99), first, answers, "answer-1", { reassess: true });
  assert.equal(recoverInterview([...entries, { type: "custom", customType: INTERVIEW_STATE, data: review }]).reviewing, false);
  assert.equal(recoverInterview([...entries, { type: "message", id: "answer-2", message: { role: "user", content: "A new answer supersedes that review." } }]).reviewing, false);
});
