import assert from "node:assert/strict";
import test from "node:test";
import { interviewDisplayNote, interviewRoundColor, renderStyledInterview, renderStyledPendingInterview } from "./interview-display.ts";
import { renderCurrentInterview } from "./interview-report.ts";

const theme = {
  fg: (color, text) => `<${color}>${text}</${color}>`,
  bold: text => `<bold>${text}</bold>`,
};
const plainTheme = { fg: (_color, text) => text, bold: text => text };
const state = {
  ambiguity: 36, delta: 4.5, round: 13, status: "interviewing",
  proposal: { question: "Which outcome matters most?", changeReason: "A new answer clarified intent.", intent: "The clarified intent." },
  questionFormatting: { deferred: ["What other outcome matters?"] },
};

test("round colors rotate deterministically and survive resumed or historical rendering", () => {
  const colors = [1, 2, 3, 4].map(interviewRoundColor);
  assert.equal(new Set(colors).size, 4);
  assert.equal(interviewRoundColor(5), colors[0]);
  assert.equal(interviewRoundColor(13), colors[0]);
  for (const invalid of [undefined, 0, -1, NaN, Infinity, 1.5]) assert.equal(interviewRoundColor(invalid), colors[0]);
  const historical = renderStyledInterview(state, false, theme);
  renderStyledInterview({ ...state, round: 14 }, false, theme);
  assert.equal(renderStyledInterview(structuredClone(state), false, theme), historical);
});

test("question heading and body are bold in the same color, before muted details", () => {
  const original = structuredClone(state);
  const text = renderStyledInterview(state, false, theme);
  assert.ok(text.startsWith("<bold><accent>QUESTION 13 | YOUR CHOICE</accent></bold>\n\n"));
  assert.ok(text.includes(`<bold><accent>${state.proposal.question}</accent></bold>\n\n<muted>`));
  assert.equal(text.split(state.proposal.question).length - 1, 1);
  assert.ok(text.indexOf(state.proposal.question) < text.indexOf("Ambiguity 36.0%"));
  assert.match(text, /\+4.5 percentage points/);
  assert.ok(text.includes(state.proposal.changeReason));
  assert.ok(text.includes(interviewDisplayNote(state)));
  assert.ok(!text.includes(state.questionFormatting.deferred[0]));
  assert.deepEqual(state, original);
});

test("Korean question framing and score remain readable without color", () => {
  const koreanState = { ...state, proposal: { ...state.proposal, question: "어떤 결과가 가장 중요한가요?" } };
  const text = renderStyledInterview(koreanState, true, plainTheme);
  assert.ok(text.startsWith("질문 13 · 선택 차례\n\n어떤 결과가 가장 중요한가요?\n\n"));
  assert.match(text, /모호성 36.0%.*\+4.5 %p.*참고 정보/);
  assert.match(text, /\/lite-interview finish/);
  assert.ok(text.includes(interviewDisplayNote(state, true)));
});

test("pending phases do not highlight or repeat obsolete questions and confirmation", () => {
  for (const status of ["interviewing", "awaiting_confirmation"]) {
    for (const phase of ["processing", "retrying", "stopped"]) {
      for (const korean of [false, true]) {
        const text = renderStyledPendingInterview({ ...state, status }, korean, theme, "Saved answer.", phase);
        const color = phase === "processing" ? "muted" : "warning";
        assert.ok(text.startsWith(`<bold><${color}>`));
        assert.ok(!text.includes(state.proposal.question));
        assert.ok(!text.includes(state.proposal.intent));
        assert.doesNotMatch(text, /YOUR TURN|답변 차례|\/lite-interview confirm|<accent>/);
        assert.match(text, /36.0%/);
        assert.match(text, /Saved answer/);
      }
    }
  }
});

test("paused, confirmed, and unassessed states retain their existing semantics", () => {
  for (const status of ["paused", "awaiting_confirmation", "confirmed"]) {
    const next = { ...state, status };
    assert.equal(renderStyledInterview(next, false, theme), `${renderCurrentInterview(next)}\n${interviewDisplayNote(next)}`);
  }
  assert.equal(renderStyledInterview(undefined, false, theme), renderCurrentInterview(undefined));
  assert.doesNotMatch(renderStyledPendingInterview(undefined, false, theme), /undefined|NaN/);
});

test("model-facing reports stay plain and contain the original score and question", () => {
  const text = [renderCurrentInterview(state), interviewDisplayNote(state)].join("\n");
  assert.match(text, /^\[Your choice\]/);
  assert.ok(text.includes(state.proposal.question));
  assert.doesNotMatch(text, /\x1b|<bold>|<accent>/);
});
