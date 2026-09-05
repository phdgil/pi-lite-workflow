import assert from "node:assert/strict";
import test from "node:test";
import { formatInterviewQuestion, prepareInterviewReport, renderCurrentInterview, renderPendingInterview } from "./interview-report.mjs";

test("the observed two-question report keeps one question and defers the other", () => {
  const original = "Have you opened the syllabus HWPX, and what databases does it list week by week? Which unfamiliar DB category comes first?";
  const formatted = formatInterviewQuestion(original);
  assert.equal(formatted.question, "Have you opened the syllabus HWPX, and what databases does it list week by week?");
  assert.equal(formatted.original, original);
  assert.deepEqual(formatted.deferred, ["Which unfamiliar DB category comes first?"]);
});

test("whitespace and numbered questions are formatting, not lost user answers", () => {
  assert.equal(formatInterviewQuestion("What observable\nresult matters most?").question, "What observable result matters most?");
  const formatted = formatInterviewQuestion("1. 무엇을 만들까요?\n2. 누구에게 필요한가요?");
  assert.equal(formatted.question, "무엇을 만들까요?");
  assert.deepEqual(formatted.deferred, ["누구에게 필요한가요?"]);
});

test("an oversized single question is not silently truncated", () => {
  assert.throws(() => formatInterviewQuestion("x".repeat(501) + "?"), /500/);
  assert.equal(formatInterviewQuestion("").question, "");
});

test("punctuation inside quotes is not used to silently cut a question", () => {
  assert.throws(() => formatInterviewQuestion('Does "Why? Now?" describe your goal?'), /one question/i);
});

test("premature final-question framing is removed without altering the question", () => {
  for (const prefix of ["One final material unknown: ", "Last question: ", "One last question: ", "Wrapping-up question: ", "One more question: ", "Just one more question: ", "마지막 질문입니다: ", "마지막으로, "]) {
    assert.equal(formatInterviewQuestion(prefix + "Which outcome matters?").question, "Which outcome matters?");
  }
  assert.equal(formatInterviewQuestion("What is the last question in the supplied survey?").question, "What is the last question in the supplied survey?");
  const dimension = { score: 0.5, evidence: ["answer-1"], gap: "Intended outcome is still unclear" };
  const state = prepareInterviewReport({ goal: dimension, constraints: dimension, success: dimension, blockers: [], intent: "Clarify the outcome.", changeReason: "Scope is still unclear.", question: "One more question: Which outcome matters?" }, undefined, [{ id: "answer-1", text: "An initial intention." }], "answer-1");
  assert.equal(state.proposal.question, "Which outcome matters?");
});

test("pending or failed assessments hide the obsolete question and completion prompt", () => {
  const state = { ambiguity: 4, round: 2, status: "awaiting_confirmation", proposal: { question: "OBSOLETE QUESTION", intent: "OBSOLETE INTENT" } };
  const text = renderPendingInterview(state, false, "Correcting this report automatically.");
  assert.match(text, /4.0%/);
  assert.match(text, /previous.*not.*current/i);
  assert.match(text, /answer.*saved/i);
  assert.match(text, /^\[Processing your answer\] No additional reply needed/);
  assert.doesNotMatch(text, /OBSOLETE|\/solar-interview confirm/);
  assert.match(renderPendingInterview(undefined, true, "재평가 중"), /새 질문.*대기/);
});

test("ready, correcting, and stopped panels distinguish whose turn it is", () => {
  const state = { ambiguity: 36, delta: 4.5, round: 13, status: "interviewing", proposal: { question: "NEW QUESTION?", changeReason: "A new answer clarified intent." } };
  assert.match(renderCurrentInterview(state), /^\[Your choice\]/);
  assert.match(renderCurrentInterview(state, true), /^\[선택 차례\]/);
  assert.match(renderPendingInterview(state, true, undefined, "retrying"), /^\[자동 수정 중\]/);
  const stopped = renderPendingInterview(state, false, undefined, "stopped");
  assert.match(stopped, /^\[Processing stopped\]/);
  assert.doesNotMatch(stopped, /NEW QUESTION|Processing your answer|Your turn/);
});

test("formatting keeps evidence checks while accepting an optional question", () => {
  const dimension = { score: 0.99, evidence: ["answer-1"], gap: "Only minor wording remains" };
  const proposal = { goal: dimension, constraints: dimension, success: dimension, blockers: [], intent: "Clarified intent.", changeReason: "Explicit user confirmation of the requirements.", question: "" };
  const answers = [{ id: "answer-1", text: "The complete requirements." }];
  assert.equal(prepareInterviewReport(proposal, undefined, answers, "answer-1").status, "awaiting_choice");
  assert.throws(() => prepareInterviewReport({ ...proposal, goal: { ...dimension, evidence: ["invented"] } }, undefined, answers, "answer-1"), /Available IDs/);
  const input = { ...proposal, goal: { ...dimension, score: 0.5, gap: "Outcome unclear" }, question: "Which outcome matters? Which evidence would demonstrate it?" };
  const original = structuredClone(input);
  const state = prepareInterviewReport(input, undefined, answers, "answer-1");
  assert.equal(state.proposal.question, "Which outcome matters?");
  assert.deepEqual(state.questionFormatting.deferred, ["Which evidence would demonstrate it?"]);
  assert.deepEqual(input, original);
});
