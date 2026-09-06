import assert from "node:assert/strict";
import test from "node:test";
import { interviewDisplayNote, interviewRoundColor, renderStyledInterview, renderStyledPendingInterview } from "./interview-display.ts";
import { renderCurrentInterview } from "./interview-report.ts";
import { assessInterview, interviewContentHash } from "./interview.ts";

const theme = {
  fg: (color, text) => `<${color}>${text}</${color}>`,
  bold: text => `<bold>${text}</bold>`,
};
const plainTheme = { fg: (_color, text) => text, bold: text => text };
const answers = Array.from({ length: 13 }, (_, index) => ({
  id: `answer-${index + 1}`,
  text: index === 0 ? "Produce an offline comparison report." : `Saved clarification ${index + 1}.`,
}));
const answerHash = interviewContentHash(answers[0].text);

function proposal({ question = "Which outcome matters most?", strategy = "question", status = "not_ready" } = {}) {
  const dimension = { score: status === "ready" ? 1 : 0.64, evidence: ["answer-1"], gap: status === "ready" ? "" : "The observable outcome remains open." };
  const ready = status === "ready";
  return {
    goal: dimension,
    constraints: dimension,
    success: dimension,
    blockers: [],
    deferred: [],
    intent: "Produce an offline comparison report.",
    changeReason: "A saved answer clarified the intended outcome.",
    question,
    strategy,
    ...(ready ? {} : { currentGapId: "outcome" }),
    materialState: {
      topics: [{ topicId: "deliverable", kind: "decision", normalizedValue: "produce an offline comparison report", sourceContentHashes: [answerHash] }],
      gaps: [{ gapId: "outcome", status: ready ? "resolved" : "open", normalizedSummary: ready ? "the report itself is the observable outcome" : "the observable outcome remains open" }],
      claims: [],
    },
    readiness: ready ? {
      status: "ready",
      goalSentence: "Produce an offline comparison report that records the requested outcome.",
      materialGaps: [],
      contradictions: [],
    } : {
      status: "not_ready",
      materialGaps: [{ id: "outcome", issue: "The observable outcome remains open.", evidenceIds: ["answer-1"], researchable: false }],
      contradictions: [],
    },
  };
}

function assessed(input) {
  return assessInterview(input, undefined, answers, "answer-1", { researchHead: null });
}

const state = {
  ...assessed(proposal()),
  questionFormatting: { question: "Which outcome matters most?", original: "Which outcome matters most? What else?", deferred: ["What other outcome matters?"] },
};
const awaitingChoice = assessed(proposal({ question: "", strategy: "question" }));
const awaitingResearch = assessed(proposal({ question: "", strategy: "research" }));
const awaitingGoalConfirmation = assessed(proposal({ question: "", strategy: "ready", status: "ready" }));
const paused = assessed(proposal({ question: "", strategy: "blocked" }));

test("round colors rotate deterministically and survive resumed or historical V2 rendering", () => {
  const colors = [1, 2, 3, 4].map(interviewRoundColor);
  assert.equal(new Set(colors).size, 4);
  assert.equal(interviewRoundColor(5), colors[0]);
  assert.equal(interviewRoundColor(13), colors[0]);
  for (const invalid of [undefined, 0, -1, NaN, Infinity, 1.5]) assert.equal(interviewRoundColor(invalid), colors[0]);
  const historical = renderStyledInterview(state, false, theme);
  renderStyledInterview({ ...state, round: 14 }, false, theme);
  assert.equal(renderStyledInterview(structuredClone(state), false, theme), historical);
});

test("the V2 question heading and body stay bold in the same color before muted details", () => {
  const original = structuredClone(state);
  const text = renderStyledInterview(state, false, theme);
  assert.ok(text.startsWith("<bold><accent>QUESTION 13 | YOUR CHOICE</accent></bold>\n\n"));
  assert.ok(text.includes(`<bold><accent>${state.proposal.question}</accent></bold>\n\n<muted>`));
  assert.equal(text.split(state.proposal.question).length - 1, 1);
  assert.ok(text.indexOf(state.proposal.question) < text.indexOf("Ambiguity 36.0%"));
  assert.match(text, /no prior verified score/);
  assert.ok(text.includes(state.proposal.changeReason));
  assert.ok(text.includes(interviewDisplayNote(state)));
  assert.ok(!text.includes(state.questionFormatting.deferred[0]));
  assert.deepEqual(state, original);
});

test("Korean V2 question framing and advisory score remain readable without color", () => {
  const koreanState = { ...state, proposal: { ...state.proposal, question: "어떤 결과가 가장 중요한가요?" } };
  const text = renderStyledInterview(koreanState, true, plainTheme);
  assert.ok(text.startsWith("질문 13 · 선택 차례\n\n어떤 결과가 가장 중요한가요?\n\n"));
  assert.match(text, /모호성 36.0%.*이전 검증 점수 없음.*참고 정보/);
  assert.match(text, /\/solar-interview finish/);
  assert.ok(text.includes(interviewDisplayNote(state, true)));
});

test("pending phases hide obsolete V2 questions, goals, and confirmation tokens", () => {
  for (const pendingState of [state, awaitingGoalConfirmation]) {
    for (const phase of ["processing", "retrying", "stopped"]) {
      for (const korean of [false, true]) {
        const text = renderStyledPendingInterview(pendingState, korean, theme, "Saved answer.", phase);
        const color = phase === "processing" ? "muted" : "warning";
        assert.ok(text.startsWith(`<bold><${color}>`));
        assert.ok(!text.includes(state.proposal.question));
        assert.ok(!text.includes(awaitingGoalConfirmation.proposal.readiness.goalSentence));
        assert.ok(!text.includes(awaitingGoalConfirmation.goalToken));
        assert.doesNotMatch(text, /YOUR TURN|답변 차례|\/solar-interview confirm|<accent>/);
        assert.ok(text.includes(pendingState === state ? "36.0%" : "0.0%"));
        assert.match(text, /Saved answer/);
      }
    }
  }
});

test("supported V2 choice, research, confirmation, and pause states delegate to current report rendering", () => {
  for (const next of [awaitingChoice, awaitingResearch, awaitingGoalConfirmation, paused]) {
    assert.equal(renderStyledInterview(next, false, theme), renderCurrentInterview(next));
  }
  assert.match(renderStyledInterview(awaitingGoalConfirmation, false, theme), /^\[Confirmation choice\]/);
  assert.match(renderStyledInterview(awaitingResearch, false, theme), /^\[Research needed\]/);
  assert.match(renderStyledInterview(paused, false, theme), /^\[Paused\]/);
  assert.equal(renderStyledInterview(undefined, false, theme), renderCurrentInterview(undefined));
  assert.doesNotMatch(renderStyledPendingInterview(undefined, false, theme), /undefined|NaN/);
});

test("model-facing V2 reports stay plain and contain the current score and question", () => {
  const text = [renderCurrentInterview(state), interviewDisplayNote(state)].join("\n");
  assert.match(text, /^\[Your choice\]/);
  assert.ok(text.includes(state.proposal.question));
  assert.match(text, /informational only/);
  assert.doesNotMatch(text, /\x1b|<bold>|<accent>/);
});
