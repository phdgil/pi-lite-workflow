import assert from "node:assert/strict";
import test from "node:test";
import { goalToken, interviewContentHash } from "./interview.ts";
import { formatInterviewQuestion, prepareInterviewReport, renderCurrentInterview, renderPendingInterview } from "./interview-report.ts";

const answers = [{ id: "answer-1", text: "An initial intention." }];

function proposal(question = "Which outcome matters?") {
  const dimension = { score: 0.5, evidence: ["answer-1"], gap: "Intended outcome is still unclear" };
  return {
    goal: dimension,
    constraints: dimension,
    success: dimension,
    blockers: [],
    intent: "Clarify the outcome.",
    changeReason: "Scope is still unclear.",
    question,
    strategy: "question",
    currentGapId: "outcome",
    materialState: {
      topics: [{ topicId: "initial-intent", kind: "decision", normalizedValue: "an initial intention", sourceContentHashes: [interviewContentHash(answers[0].text)] }],
      gaps: [{ gapId: "outcome", status: "open", normalizedSummary: "intended outcome remains unclear" }],
      claims: [],
    },
    readiness: {
      status: "not_ready",
      materialGaps: [{ id: "outcome", issue: "The intended outcome remains unclear.", evidenceIds: ["answer-1"], researchable: false }],
      contradictions: [],
    },
  };
}

function readyProposal() {
  const input = proposal("");
  input.strategy = "ready";
  delete input.currentGapId;
  input.materialState.gaps[0].status = "resolved";
  input.materialState.gaps[0].normalizedSummary = "the intended outcome is a concise offline report";
  input.readiness = {
    status: "ready",
    goalSentence: "Write a concise offline report that answers the named question.",
    materialGaps: [],
    contradictions: [],
  };
  return input;
}

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
  const state = prepareInterviewReport({ ...proposal(), question: "One more question: Which outcome matters?" }, undefined, answers, "answer-1");
  assert.equal(state.proposal.question, "Which outcome matters?");
});

test("pending or failed assessments hide obsolete questions and distinguish early finish", () => {
  const state = prepareInterviewReport(proposal(), undefined, answers, "answer-1");
  state.proposal.question = "OBSOLETE QUESTION";
  const text = renderPendingInterview(state, false, "Correcting this report automatically.");
  assert.match(text, /50.0%/);
  assert.match(text, /previous.*not.*current/i);
  assert.match(text, /answer.*saved/i);
  assert.match(text, /^\[Processing your answer\] No additional reply needed/);
  assert.doesNotMatch(text, /OBSOLETE|\/solar-interview confirm/);
  assert.match(text, /Normal closure requires current readiness.*explicit early finish/i);
  assert.match(renderPendingInterview(undefined, true, "재평가 중"), /새 질문.*대기/);
});

test("question, goal-confirmation, research, and paused panels distinguish whose turn it is", () => {
  const interviewing = prepareInterviewReport(proposal("NEW QUESTION?"), undefined, answers, "answer-1");
  assert.match(renderCurrentInterview(interviewing), /^\[Your choice\]/);
  assert.match(renderCurrentInterview(interviewing, true), /^\[선택 차례\]/);

  const ready = prepareInterviewReport(readyProposal(), undefined, answers, "answer-1");
  assert.match(renderCurrentInterview(ready), /^\[Confirmation choice\]/);
  assert.match(renderCurrentInterview(ready), new RegExp(goalToken(ready)));

  const researchInput = proposal("");
  researchInput.strategy = "research";
  const research = prepareInterviewReport(researchInput, undefined, answers, "answer-1");
  assert.match(renderCurrentInterview(research), /^\[Research needed\]/);

  const blockedInput = proposal("");
  blockedInput.strategy = "blocked";
  const paused = prepareInterviewReport(blockedInput, undefined, answers, "answer-1");
  assert.match(renderCurrentInterview(paused), /^\[Paused\]/);
  assert.match(renderCurrentInterview(paused), /answer\/clarify.*targeted public research.*finish early/is);

  assert.match(renderPendingInterview(interviewing, true, undefined, "retrying"), /^\[자동 수정 중\]/);
  const stopped = renderPendingInterview(interviewing, false, undefined, "stopped");
  assert.match(stopped, /^\[Processing stopped\]/);
  assert.doesNotMatch(stopped, /NEW QUESTION|Processing your answer|Your turn/);
});

test("formatting keeps V2 evidence checks while accepting an optional question", () => {
  const optional = proposal("");
  assert.equal(prepareInterviewReport(optional, undefined, answers, "answer-1").status, "awaiting_choice");
  assert.throws(() => prepareInterviewReport({ ...optional, goal: { ...optional.goal, evidence: ["invented"] } }, undefined, answers, "answer-1"), /Available IDs/);
  const input = proposal("Which outcome matters? Which evidence would demonstrate it?");
  const original = structuredClone(input);
  const state = prepareInterviewReport(input, undefined, answers, "answer-1");
  assert.equal(state.proposal.question, "Which outcome matters?");
  assert.deepEqual(state.questionFormatting.deferred, ["Which evidence would demonstrate it?"]);
  assert.deepEqual(input, original);
});
